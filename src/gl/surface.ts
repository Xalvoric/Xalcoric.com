import * as THREE from 'three'
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js'
import { T } from '../config'
import { clamp, easeInCubic, easeOutCubic, invLerp, mulberry32, smoothstep } from '../util'
import { VALUE_NOISE } from './glsl'
import { pullBack, sampleKeys, type CamKey } from './keys'
import { createNoise2D, fbm2 } from './noise'
import { anchor, toScreen, type FrameCtx, type Stage } from './stage'
import { noiseNormalMap } from './textures'

// Chapter 01, the surface: a monolith of stacked graphite blocks on a snow ridge.
// Light leaks through the seams; blocks nudge away from the cursor; on scroll
// the blocks lift off and the camera climbs into cloud.

const COURSES = 15
const COURSE_H = 0.46
const BLOCK_H = 0.41
const DEPTH = 0.42
const W_BASE = 1.25
const W_TOP = 0.82
const TOWER_H = COURSES * COURSE_H

const INTRO_KEYS: CamKey[] = [
  { t: 0, pos: [0, 24, 44], look: [0, 5, 0] },
  { t: 0.55, pos: [14, 11, 27], look: [0, 5.2, 0] },
  { t: 1, pos: [9.6, 5.4, 17.6], look: [0, 5.5, 0] },
]

const SCROLL_KEYS: CamKey[] = [
  { t: 0, pos: [9.6, 5.4, 17.6], look: [0, 5.5, 0] },
  { t: T.heroEnd, pos: [8.4, 5.8, 15.6], look: [0, 5.7, 0] },
  { t: T.heroEnd + 0.035, pos: [5.4, 11, 10.5], look: [0, 12, 0], ease: 'lin' },
  { t: T.surfaceEnd, pos: [2.5, 18, 5], look: [0, 26, -2] },
]

type Block = {
  base: THREE.Vector3
  quat: THREE.Quaternion
  scale: THREE.Vector3
  normal: THREE.Vector3
  course: number
  seed: number
  /** Where it flies in from during the intro. */
  from: THREE.Vector3
  fromRot: THREE.Euler
  hover: number
  hoverVel: number
}

export class Surface implements Stage {
  group = new THREE.Group()
  fogColor = new THREE.Color('#9da3ae')
  fogDensity = 0.021
  skyTop = new THREE.Color('#c3c7cf')
  skyBottom = new THREE.Color('#8e94a0')

  private blocks: Block[] = []
  private mesh!: THREE.InstancedMesh
  private hitMesh!: THREE.InstancedMesh
  private glowAttr!: THREE.InstancedBufferAttribute
  private blockUniforms = { uEdge: { value: 0 }, uTime: { value: 0 } }
  private core!: THREE.Mesh
  private coreMat!: THREE.MeshBasicMaterial
  private tip!: THREE.Group
  private wire!: THREE.LineSegments
  private network!: THREE.Group
  private lineUniforms = { uReveal: { value: 0 }, uFade: { value: 0 } }
  private snow!: THREE.Points
  private snowUniforms = {
    uTime: { value: 0 },
    uPR: { value: 1 },
    uFogColor: { value: new THREE.Color() },
    uOpacity: { value: 0.8 },
  }
  private terrainUniforms = { uGlow: { value: 0 } }
  private baseLight!: THREE.PointLight
  private monolith = new THREE.Group()
  private hovered = new THREE.Vector3()
  private hasHover = false
  private shock = 0
  private labelBlocks: number[] = []
  private labelValues: number[] = []
  private labelNext: number[] = []
  private m4 = new THREE.Matrix4()
  private q = new THREE.Quaternion()
  private q2 = new THREE.Quaternion()
  private e = new THREE.Euler()
  private v = new THREE.Vector3()
  private v2 = new THREE.Vector3()
  private s = new THREE.Vector3()
  private rand = mulberry32(42)
  baseY = 0

  constructor(private tier: 'high' | 'low') {}

  build() {
    this.buildLights()
    this.buildTerrain()
    this.buildMonolith()
    this.buildIntroLines()
    this.buildSnow()
    this.group.add(this.monolith)
    this.monolith.position.y = this.baseY
  }

  // ---------- construction ----------

  private buildLights() {
    const hemi = new THREE.HemisphereLight('#eef1f6', '#4b505a', 1.0)
    const key = new THREE.DirectionalLight('#ffffff', 1.5)
    key.position.set(-14, 7, 3)
    const fill = new THREE.DirectionalLight('#dfe6f0', 0.35)
    fill.position.set(9, 5, 11)
    this.baseLight = new THREE.PointLight('#ffffff', 0, 12, 1.4)
    this.group.add(hemi, key, fill, this.baseLight)
  }

  private heightAt: (x: number, z: number) => number = () => 0

  private buildTerrain() {
    const n = createNoise2D(11)
    const n2 = createNoise2D(29)
    const mound = (r: number) => 1.9 * Math.exp(-(r * r) / (2 * 8.5 * 8.5))
    this.heightAt = (x, z) => {
      const r = Math.hypot(x, z)
      const near = smoothstep(2.0, 6.5, r)
      const detail = fbm2(n, x * 0.055, z * 0.055, 5) * (0.5 + smoothstep(5, 32, r) * 3.6)
      const ridge = Math.pow(1 - Math.abs(fbm2(n2, x * 0.009, z * 0.009, 3)), 1.6) * smoothstep(28, 95, r) * 30
      const swell = fbm2(n2, x * 0.02 + 9, z * 0.02 - 3, 3) * smoothstep(10, 40, r) * 6
      return mound(r) + detail * near + ridge + swell - 0.6
    }
    this.baseY = this.heightAt(0, 0) - 0.12

    const seg = this.tier === 'high' ? 260 : 170
    const geo = new THREE.PlaneGeometry(300, 300, seg, seg)
    geo.rotateX(-Math.PI / 2)
    const pos = geo.attributes.position as THREE.BufferAttribute
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, this.heightAt(pos.getX(i), pos.getZ(i)))
    }
    geo.computeVertexNormals()

    const nrm = geo.attributes.normal as THREE.BufferAttribute
    const colors = new Float32Array(pos.count * 3)
    const snow = new THREE.Color('#cfd3da')
    const rock = new THREE.Color('#6b707a')
    const c = new THREE.Color()
    for (let i = 0; i < pos.count; i++) {
      const rocky = 1 - smoothstep(0.6, 0.88, nrm.getY(i))
      const mottling = 0.93 + 0.07 * n(pos.getX(i) * 0.4, pos.getZ(i) * 0.4)
      c.copy(snow).lerp(rock, rocky).multiplyScalar(mottling)
      colors.set([c.r, c.g, c.b], i * 3)
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    const normalMap = noiseNormalMap(256, 5, 2.6)
    normalMap.repeat.set(60, 60)
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.93,
      metalness: 0,
      normalMap,
      normalScale: new THREE.Vector2(0.7, 0.7),
      envMapIntensity: 0.25,
    })
    const u = this.terrainUniforms
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uGlow = u.uGlow
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorldXZ;')
        .replace(
          '#include <project_vertex>',
          '#include <project_vertex>\nvWorldXZ = (modelMatrix * vec4(transformed, 1.0)).xyz;',
        )
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\nvarying vec3 vWorldXZ;\nuniform float uGlow;\n${VALUE_NOISE}`)
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float rr = length(vWorldXZ.xz);
          // contact shadow hugging the monolith footprint
          diffuseColor.rgb *= 1.0 - 0.55 * exp(-pow(max(rr - 1.1, 0.0), 2.0) / 0.9);
          // wind-packed snow streaks
          diffuseColor.rgb *= 0.94 + 0.08 * fbm(vWorldXZ.xz * vec2(0.9, 2.6));`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float ring = exp(-pow(rr - 1.9, 2.0) / 1.6);
          totalEmissiveRadiance += vec3(0.85, 0.9, 1.0) * ring * uGlow * 0.22;`,
        )
    }
    const terrain = new THREE.Mesh(geo, mat)
    this.group.add(terrain)
  }

  private buildMonolith() {
    const rand = this.rand
    const add = (center: THREE.Vector3, normal: THREE.Vector3, len: number, course: number, tilt: number) => {
      const yaw = Math.atan2(normal.x, normal.z)
      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-tilt, yaw, 0, 'YXZ'))
      this.q2.setFromEuler(new THREE.Euler((rand() - 0.5) * 0.05, (rand() - 0.5) * 0.06, (rand() - 0.5) * 0.04))
      quat.multiply(this.q2)
      const scale = new THREE.Vector3(len * (0.95 + rand() * 0.04), BLOCK_H * (0.93 + rand() * 0.07), DEPTH * (0.94 + rand() * 0.1))
      const base = center.clone().addScaledVector(normal, (rand() - 0.5) * 0.04)
      const out = normal.clone()
      const from = base
        .clone()
        .addScaledVector(out, 3 + rand() * 6)
        .add(new THREE.Vector3((rand() - 0.5) * 6, 5 + rand() * 9, (rand() - 0.5) * 6))
      this.blocks.push({
        base,
        quat,
        scale,
        normal: out,
        course,
        seed: rand(),
        from,
        fromRot: new THREE.Euler((rand() - 0.5) * 3, (rand() - 0.5) * 3, (rand() - 0.5) * 3),
        hover: 0,
        hoverVel: 0,
      })
    }

    const tilt = Math.atan((W_BASE - W_TOP) / TOWER_H)
    for (let k = 0; k < COURSES; k++) {
      const y = k * COURSE_H + COURSE_H / 2
      const w = W_BASE + (W_TOP - W_BASE) * (k / (COURSES - 1))
      const zFull = k % 2 === 0
      for (const face of [0, 1, 2, 3]) {
        const normal = [
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(0, 0, -1),
          new THREE.Vector3(-1, 0, 0),
        ][face]
        const full = face % 2 === 0 ? zFull : !zFull
        const span = full ? 2 * w : 2 * (w - DEPTH)
        const n = Math.max(1, Math.round(span / 0.74))
        const step = span / n
        for (let i = 0; i < n; i++) {
          const along = -span / 2 + step * (i + 0.5)
          const tangent = new THREE.Vector3(-normal.z, 0, normal.x)
          const center = normal
            .clone()
            .multiplyScalar(w - DEPTH / 2)
            .addScaledVector(tangent, along)
          center.y = y
          add(center, normal, step - 0.055, k, tilt)
        }
      }
    }
    // Stepped cap: two shrinking rings of blocks.
    for (let j = 0; j < 2; j++) {
      const y = TOWER_H + j * 0.36 + 0.18
      const w = W_TOP * (0.82 - j * 0.26)
      for (const face of [0, 1, 2, 3]) {
        const normal = [
          new THREE.Vector3(0, 0, 1),
          new THREE.Vector3(1, 0, 0),
          new THREE.Vector3(0, 0, -1),
          new THREE.Vector3(-1, 0, 0),
        ][face]
        const span = face % 2 === 0 ? 2 * w : 2 * (w - DEPTH * 0.8)
        const center = normal.clone().multiplyScalar(w - DEPTH * 0.4)
        center.y = y
        add(center, normal, span - 0.06, COURSES + j, tilt * 3)
      }
    }

    const count = this.blocks.length
    const geo = new RoundedBoxGeometry(1, 1, 1, 3, 0.09)
    this.glowAttr = new THREE.InstancedBufferAttribute(new Float32Array(count), 1)
    this.glowAttr.setUsage(THREE.DynamicDrawUsage)
    geo.setAttribute('aGlow', this.glowAttr)
    const seeds = new Float32Array(count)
    this.blocks.forEach((b, i) => (seeds[i] = b.seed))
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1))

    const mat = new THREE.MeshStandardMaterial({
      color: '#30343b',
      roughness: 0.6,
      metalness: 0.12,
      envMapIntensity: 0.3,
    })
    const u = this.blockUniforms
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uEdge = u.uEdge
      shader.uniforms.uTime = u.uTime
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          '#include <common>\nattribute float aGlow;\nattribute float aSeed;\nvarying vec3 vLocal;\nvarying float vGlow;\nvarying float vSeed;\nvarying vec3 vWorld;',
        )
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;\nvGlow = aGlow;\nvSeed = aSeed;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec4 xw = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
          xw = instanceMatrix * xw;
          #endif
          vWorld = (modelMatrix * xw).xyz;`,
        )
      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>\nuniform float uEdge;\nuniform float uTime;\nvarying vec3 vLocal;\nvarying float vGlow;\nvarying float vSeed;\nvarying vec3 vWorld;\n${VALUE_NOISE}`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          float grit = fbm(vWorld.xy * 3.1 + vWorld.zx * 2.3 + vSeed * 13.0);
          diffuseColor.rgb *= 0.78 + 0.42 * grit;`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          vec3 a = abs(vLocal) * 2.0;
          float mx = max(a.x, max(a.y, a.z));
          float mn = min(a.x, min(a.y, a.z));
          float mid = a.x + a.y + a.z - mx - mn;
          float edge = smoothstep(0.9, 1.0, mid);
          float back = smoothstep(0.7, 1.0, -vLocal.z * 2.0); // inner faces catch the core light
          float flicker = 0.85 + 0.15 * sin(uTime * 2.3 + vSeed * 40.0);
          totalEmissiveRadiance += vec3(0.92, 0.95, 1.0) * (edge * uEdge * 1.5 * flicker + back * uEdge * 0.25);
          totalEmissiveRadiance += vec3(0.9, 0.94, 1.0) * vGlow * (0.35 + edge * 1.4);`,
        )
    }

    this.mesh = new THREE.InstancedMesh(geo, mat, count)
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    this.mesh.frustumCulled = false
    this.hitMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial(), count)
    this.hitMesh.visible = false
    this.blocks.forEach((b, i) => {
      this.m4.compose(b.base, b.quat, b.scale)
      this.mesh.setMatrixAt(i, this.m4)
      this.hitMesh.setMatrixAt(i, this.m4)
    })
    this.monolith.add(this.mesh, this.hitMesh)

    // The light inside: a tapered emissive core showing through the seams.
    const inset = DEPTH * 0.75
    const coreGeo = new THREE.CylinderGeometry(
      (W_TOP - inset) * Math.SQRT2,
      (W_BASE - inset) * Math.SQRT2,
      TOWER_H + 0.3,
      4,
      1,
    )
    coreGeo.rotateY(Math.PI / 4)
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0, 0, 0) })
    this.core = new THREE.Mesh(coreGeo, this.coreMat)
    this.core.position.y = TOWER_H / 2
    this.monolith.add(this.core)

    // Pyramidion: a dark cap with lit edges.
    this.tip = new THREE.Group()
    const tipGeo = new THREE.ConeGeometry(0.55, 1.15, 4, 1)
    tipGeo.rotateY(Math.PI / 4)
    const tipMesh = new THREE.Mesh(
      tipGeo,
      new THREE.MeshStandardMaterial({ color: '#3f444d', roughness: 0.35, metalness: 0.3, flatShading: true }),
    )
    const tipEdges = new THREE.LineSegments(
      new THREE.EdgesGeometry(tipGeo),
      new THREE.LineBasicMaterial({ color: new THREE.Color(1.6, 1.65, 1.75), transparent: true, opacity: 0.9 }),
    )
    this.tip.add(tipMesh, tipEdges)
    this.tip.position.y = TOWER_H + 0.72 + 0.575
    this.monolith.add(this.tip)

    // Pick five blocks on the faces the hero camera sees for the number constellation.
    const visible = this.blocks
      .map((b, i) => ({ b, i }))
      .filter(({ b }) => (b.normal.z > 0.5 || b.normal.x > 0.5) && b.course >= 3 && b.course <= 11)
    const picks = [0.12, 0.3, 0.5, 0.68, 0.86].map((f) => visible[Math.floor(f * (visible.length - 1))].i)
    this.labelBlocks = picks
    this.labelValues = picks.map(() => 10 + Math.floor(this.rand() * 89))
    this.labelNext = picks.map((_, i) => 1 + i * 0.37)
  }

  private buildIntroLines() {
    const rand = mulberry32(7)
    // Blueprint: the edges of every block, drawn on before the blocks land.
    const corners = [
      [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5],
      [-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5],
    ]
    const edges = [
      [0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7],
    ]
    const pos: number[] = []
    const delay: number[] = []
    const p = new THREE.Vector3()
    for (const b of this.blocks) {
      this.m4.compose(b.base, b.quat, b.scale)
      const d = (b.course / (COURSES + 2)) * 0.55 + rand() * 0.12
      for (const [a, c] of edges) {
        for (const idx of [a, c]) {
          p.fromArray(corners[idx]).applyMatrix4(this.m4)
          pos.push(p.x, p.y, p.z)
          delay.push(d)
        }
      }
    }
    const wireGeo = new THREE.BufferGeometry()
    wireGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
    wireGeo.setAttribute('aDelay', new THREE.Float32BufferAttribute(delay, 1))
    const lineMat = new THREE.ShaderMaterial({
      uniforms: this.lineUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aDelay;
        varying float vA;
        uniform float uReveal;
        void main() {
          vA = smoothstep(aDelay, aDelay + 0.12, uReveal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        uniform float uFade;
        void main() {
          gl_FragColor = vec4(vec3(1.0), vA * (1.0 - uFade) * 0.85);
        }
      `,
    })
    this.wire = new THREE.LineSegments(wireGeo, lineMat)
    this.monolith.add(this.wire)

    // Constellation network floating around the monolith during the intro.
    const N = 110
    const pts: THREE.Vector3[] = []
    for (let i = 0; i < N; i++) {
      const r = 3.2 + Math.pow(rand(), 0.7) * 15
      const a = rand() * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(a) * r, 0.5 + rand() * 13, Math.sin(a) * r))
    }
    const npos: number[] = []
    const ndel: number[] = []
    for (let i = 0; i < N; i++) {
      const near = pts
        .map((q, j) => ({ j, d: q.distanceToSquared(pts[i]) }))
        .filter((o) => o.j !== i)
        .sort((x, y) => x.d - y.d)
        .slice(0, 2)
      for (const { j } of near) {
        if (j < i) continue
        npos.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z)
        const d = (pts[i].length() / 18) * 0.5
        ndel.push(d, d + 0.05)
      }
    }
    const netGeo = new THREE.BufferGeometry()
    netGeo.setAttribute('position', new THREE.Float32BufferAttribute(npos, 3))
    netGeo.setAttribute('aDelay', new THREE.Float32BufferAttribute(ndel, 1))
    const dotGeo = new THREE.BufferGeometry().setFromPoints(pts)
    dotGeo.setAttribute('aDelay', new THREE.Float32BufferAttribute(pts.map((q) => (q.length() / 18) * 0.5), 1))
    const dotMat = new THREE.ShaderMaterial({
      uniforms: this.lineUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aDelay;
        varying float vA;
        uniform float uReveal;
        void main() {
          vA = smoothstep(aDelay, aDelay + 0.1, uReveal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = 70.0 / -mv.z;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        uniform float uFade;
        void main() {
          gl_FragColor = vec4(vec3(1.0), vA * (1.0 - uFade));
        }
      `,
    })
    this.network = new THREE.Group()
    this.network.add(new THREE.LineSegments(netGeo, lineMat), new THREE.Points(dotGeo, dotMat))
    this.network.position.y = this.baseY
    this.group.add(this.network)
  }

  private buildSnow() {
    const count = this.tier === 'high' ? 2600 : 1400
    const rand = mulberry32(3)
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = rand() * 60 - 30
      pos[i * 3 + 1] = rand() * 26
      pos[i * 3 + 2] = rand() * 60 - 30
      seed[i] = rand()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const mat = new THREE.ShaderMaterial({
      uniforms: this.snowUniforms,
      transparent: true,
      depthWrite: false,
      vertexShader: /* glsl */ `
        attribute float aSeed;
        uniform float uTime;
        uniform float uPR;
        varying float vA;
        void main() {
          vec3 p = position;
          p.x = mod(p.x + uTime * (1.4 + aSeed) + 30.0, 60.0) - 30.0;
          p.y = mod(p.y - uTime * (0.35 + aSeed * 0.5), 26.0);
          p.z = mod(p.z + sin(uTime * 0.6 + aSeed * 30.0) * 0.6 + 30.0, 60.0) - 30.0;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          gl_PointSize = (2.0 + aSeed * 3.0) * uPR * 9.0 / d;
          vA = smoothstep(0.5, 3.0, d) * exp(-d * 0.035);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        uniform float uOpacity;
        void main() {
          float r = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, r) * vA * uOpacity;
          gl_FragColor = vec4(vec3(1.0), a);
        }
      `,
    })
    this.snow = new THREE.Points(geo, mat)
    this.snow.frustumCulled = false
    this.group.add(this.snow)
  }

  // ---------- per frame ----------

  pick(raycaster: THREE.Raycaster) {
    const hit = raycaster.intersectObject(this.hitMesh, false)[0]
    if (hit) {
      this.hovered.copy(hit.point)
      this.monolith.worldToLocal(this.hovered)
      this.hasHover = true
      return true
    }
    this.hasHover = false
    return false
  }

  click() {
    if (this.hasHover) this.shock = 1
    return null
  }

  clearHover() {
    this.hasHover = false
  }

  update(ctx: FrameCtx) {
    const { p, time, dt, intro } = ctx
    this.blockUniforms.uTime.value = time
    this.snowUniforms.uTime.value = time
    this.snowUniforms.uPR.value = Math.min(window.devicePixelRatio, 2)

    // Camera: intro flight, then scroll path.
    if (intro < 1) sampleKeys(INTRO_KEYS, intro, ctx.cam)
    else sampleKeys(SCROLL_KEYS, p, ctx.cam)
    if (ctx.portrait) pullBack(ctx.cam, 1.15, -5.5)

    // Intro: lines draw on, blocks fly into the blueprint, the core lights up.
    const reveal = intro * 1.35
    this.lineUniforms.uReveal.value = reveal
    this.lineUniforms.uFade.value = smoothstep(0.62, 0.95, intro)
    this.wire.visible = this.lineUniforms.uFade.value < 0.999
    this.network.visible = this.wire.visible
    this.network.rotation.y = time * 0.03

    const lift = invLerp(T.heroEnd - 0.01, T.surfaceEnd, p)
    const coreOn = smoothstep(0.55, 0.85, intro) * (1 - smoothstep(0.1, 0.6, lift))
    this.coreMat.color.setScalar(1.7 * coreOn + 0.02)
    this.blockUniforms.uEdge.value = coreOn
    this.terrainUniforms.uGlow.value = coreOn * (1 - lift)
    this.baseLight.intensity = 4 * coreOn
    this.baseLight.position.set(0, this.baseY + 0.9, 0)
    this.tip.position.y = TOWER_H + 0.72 + 0.575 + easeInCubic(lift) * 16
    this.tip.rotation.y = easeInCubic(lift) * 2
    this.tip.visible = intro > 0.82

    this.shock = Math.max(0, this.shock - dt * 1.6)
    const blocks = this.blocks
    for (let i = 0; i < blocks.length; i++) {
      const b = blocks[i]
      // Intro landing, staggered bottom to top.
      const start = 0.3 + (b.course / (COURSES + 2)) * 0.38 + b.seed * 0.06
      const land = easeOutCubic(clamp((intro - start) / 0.2))

      // Cursor push with a little spring.
      let target = 0
      if (this.hasHover && lift === 0) {
        const d = this.v.copy(b.base).distanceTo(this.hovered)
        target = smoothstep(1.35, 0.15, d)
      }
      if (this.shock > 0 && this.hasHover) target = Math.max(target, this.shock * smoothstep(3, 0, this.v.copy(b.base).distanceTo(this.hovered)))
      const k = 90
      const c = 11
      b.hoverVel += (target - b.hover) * k * dt - b.hoverVel * c * dt
      b.hover += b.hoverVel * dt

      // Idle shimmer: one block at a time eases out and back.
      const idle = Math.pow(Math.max(0, Math.sin(time * 0.55 + b.seed * 47)), 24) * 0.09

      // Lift-off on scroll: top courses first.
      const ls = (1 - b.course / (COURSES + 2)) * 0.35 + b.seed * 0.12
      const le = easeInCubic(clamp((lift - ls) / 0.5))

      this.v.copy(b.base).addScaledVector(b.normal, b.hover * 0.34 + idle + le * (1.5 + b.seed * 3))
      this.v.y += le * (3 + b.seed * 7 + b.course * 0.35)
      this.q.copy(b.quat)
      if (b.hover > 0.001 || le > 0) {
        this.e.set(b.hover * 0.12 * (b.seed - 0.5) + le * (b.seed - 0.5) * 3, le * b.seed * 2, b.hover * 0.1 + le * (0.5 - b.seed) * 2)
        this.q.multiply(this.q2.setFromEuler(this.e))
      }
      if (land < 1) {
        this.v.lerpVectors(b.from, this.v, land)
        this.e.set(b.fromRot.x * (1 - land), b.fromRot.y * (1 - land), b.fromRot.z * (1 - land))
        this.q.multiply(this.q2.setFromEuler(this.e))
      }
      this.s.copy(b.scale).multiplyScalar(land < 1 ? 0.55 + 0.45 * land : 1)
      this.m4.compose(this.v, this.q, this.s)
      this.mesh.setMatrixAt(i, this.m4)
      const flash = land > 0 && land < 1 ? Math.sin(land * Math.PI) * 0.9 : 0
      this.glowAttr.setX(i, Math.max(0, b.hover) * 0.9 + flash + le * 0.6 + idle * 4)
    }
    this.mesh.instanceMatrix.needsUpdate = true
    this.glowAttr.needsUpdate = true

    this.snowUniforms.uOpacity.value = 0.85 * (1 - smoothstep(0.75, 1, lift))
  }

  project(ctx: FrameCtx) {
    const hud = ctx.hud
    const show = smoothstep(0.86, 1, ctx.intro) * (1 - smoothstep(0.045, 0.075, ctx.p))
    hud.labels.length = 0
    hud.constellation.pts.length = 0
    hud.constellation.o = show
    if (show <= 0.001) return
    for (let j = 0; j < this.labelBlocks.length; j++) {
      const b = this.blocks[this.labelBlocks[j]]
      this.v2.copy(b.base).addScaledVector(b.normal, DEPTH * 0.55 + b.hover * 0.34)
      this.monolith.localToWorld(this.v2)
      const a = anchor(hud, `label-${j}`)
      toScreen(this.v2, ctx, a)
      if (ctx.time > this.labelNext[j]) {
        this.labelValues[j] = 10 + Math.floor(Math.random() * 89)
        this.labelNext[j] = ctx.time + 1.1 + Math.random() * 1.6
      }
      hud.labels.push({ key: `label-${j}`, x: a.x, y: a.y, text: String(this.labelValues[j]), o: show })
      hud.constellation.pts.push([a.x, a.y])
    }
  }
}
