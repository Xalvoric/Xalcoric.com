import * as THREE from 'three'
import { T } from '../config'
import { mulberry32, smoothstep } from '../util'
import { SIMPLEX_3D } from './glsl'
import { pullBack, sampleKeys, type CamKey } from './keys'
import { buildShapes, MARK_SHAPE } from './shapes'
import type { FrameCtx, Stage } from './stage'

// Chapters 04 and 05: a pale room behind the light. A stepped platform with
// engraved rings, a halo above, and a particle form that changes shape with
// each FAQ answer, then settles into the studio mark for contact.

const KEYS: CamKey[] = [
  { t: T.portalEnd, pos: [0, 10, 23], look: [0, 3, 0] },
  { t: 0.795, pos: [0, 3.9, 11.6], look: [0, 2.2, 0] },
  { t: T.faqEnd, pos: [1.1, 3.6, 10.6], look: [0, 2.15, 0] },
  { t: 0.94, pos: [0, 3.1, 9.6], look: [0, 1.75, 0] },
  { t: 1, pos: [0, 3.0, 9.2], look: [0, 1.7, 0] },
]

const MORPH_SECONDS = 2.1

export class Room implements Stage {
  group = new THREE.Group()
  fogColor = new THREE.Color('#bcc0c8')
  fogDensity = 0.022
  skyTop = new THREE.Color('#d8dbe1')
  skyBottom = new THREE.Color('#a5aab4')

  private shapes: Float32Array[] = []
  private from!: THREE.BufferAttribute
  private to!: THREE.BufferAttribute
  private seeds!: Float32Array
  private sculpture = new THREE.Group()
  private points!: THREE.Points
  private uniforms = {
    uMorph: { value: 1 },
    uTime: { value: 0 },
    uSize: { value: 24 },
    uPR: { value: 1 },
    uScatter: { value: 1 },
    uPointer: { value: new THREE.Vector3(0, -99, 0) },
    uPointerOn: { value: 0 },
  }
  private shape = 0
  private faqShape = 0
  private morph = 1
  private halo!: THREE.Mesh
  private plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0)
  private hit = new THREE.Vector3()
  private hasPointer = false
  /** Called when the form starts changing, so the UI can play a sound. */
  onMorph: (() => void) | null = null

  constructor(private tier: 'high' | 'low') {}

  build() {
    const hemi = new THREE.HemisphereLight('#ffffff', '#6a707b', 1.0)
    const key = new THREE.DirectionalLight('#ffffff', 1.4)
    key.position.set(5, 11, 7)
    const top = new THREE.PointLight('#ffffff', 16, 26, 1.3)
    top.position.set(0, 9, 0)
    this.group.add(hemi, key, top)
    this.buildPlatform()
    this.buildParticles()
  }

  private buildPlatform() {
    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(90, 96).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#8c919b', roughness: 0.85, metalness: 0.05 }),
    )
    this.group.add(floor)

    const stone = new THREE.MeshStandardMaterial({ color: '#a9aeb7', roughness: 0.45, metalness: 0.25, envMapIntensity: 0.45 })
    const tiers: [number, number, number, number][] = [
      [5.3, 5.6, 0.36, 0.18],
      [3.45, 3.6, 0.3, 0.51],
      [1.75, 1.85, 0.26, 0.79],
    ]
    for (const [rt, rb, h, y] of tiers) {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, 128), stone)
      m.position.y = y
      this.group.add(m)
    }

    const lineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.55, 1.65) })
    const ring = (r: number, y: number, tube = 0.012) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 4, 256).rotateX(-Math.PI / 2), lineMat)
      m.position.y = y
      this.group.add(m)
    }
    ring(1.25, 0.925)
    ring(2.4, 0.665)
    ring(3.05, 0.665)
    ring(4.45, 0.365)
    ring(5.0, 0.365)
    for (const r of [7.2, 9.8, 13.5, 18.5, 26]) ring(r, 0.01, 0.02)

    // Halo above the form.
    this.halo = new THREE.Mesh(
      new THREE.TorusGeometry(2.7, 0.08, 12, 160).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.65, 2.8) }),
    )
    this.halo.position.y = 9.4
    this.group.add(this.halo)

    // Horizon arcs, the curve of the room.
    const arcMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.25, 1.28, 1.35), transparent: true, opacity: 0.7 })
    for (const [r, y, z] of [
      [34, -6, -30],
      [46, -10, -42],
    ] as const) {
      const arc = new THREE.Mesh(new THREE.TorusGeometry(r, 0.07, 6, 256, Math.PI), arcMat)
      arc.position.set(0, y, z)
      this.group.add(arc)
    }
  }

  private buildParticles() {
    const n = this.tier === 'high' ? 22000 : 11000
    this.shapes = buildShapes(n)
    const geo = new THREE.BufferGeometry()
    this.from = new THREE.BufferAttribute(new Float32Array(this.shapes[0]), 3)
    this.to = new THREE.BufferAttribute(new Float32Array(this.shapes[0]), 3)
    this.from.setUsage(THREE.DynamicDrawUsage)
    this.to.setUsage(THREE.DynamicDrawUsage)
    const rand = mulberry32(21)
    this.seeds = new Float32Array(n)
    for (let i = 0; i < n; i++) this.seeds[i] = rand()
    // `position` is required by three for bounds; the shader uses aFrom/aTo.
    geo.setAttribute('position', this.to)
    geo.setAttribute('aFrom', this.from)
    geo.setAttribute('aTo', this.to)
    geo.setAttribute('aSeed', new THREE.BufferAttribute(this.seeds, 1))

    const mat = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: /* glsl */ `
        attribute vec3 aFrom;
        attribute vec3 aTo;
        attribute float aSeed;
        uniform float uMorph;
        uniform float uTime;
        uniform float uSize;
        uniform float uPR;
        uniform float uScatter;
        uniform vec3 uPointer;
        uniform float uPointerOn;
        varying float vShade;
        ${SIMPLEX_3D}
        void main() {
          float m = smoothstep(aSeed * 0.35, 0.65 + aSeed * 0.35, uMorph);
          vec3 p = mix(aFrom, aTo, m);
          float turb = sin(3.14159 * m);
          vec3 q = p * 0.8 + vec3(0.0, uTime * 0.22, aSeed);
          vec3 nz = vec3(snoise(q), snoise(q + 17.1), snoise(q + 41.7));
          p += nz * (turb * 0.95 + 0.022 + uScatter * 3.0);
          p.y += turb * aSeed * 0.7 + uScatter * aSeed * 4.0;
          vec3 d = p - uPointer;
          float dl = length(d);
          p += normalize(d + 1e-4) * uPointerOn * smoothstep(0.95, 0.0, dl) * 0.5;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = uSize * uPR * (0.55 + aSeed * 0.9) / -mv.z;
          vec3 c = vec3(0.0, 1.6, 0.0);
          float lambert = dot(normalize(p - c + 1e-4), normalize(vec3(0.45, 0.8, 0.55))) * 0.5 + 0.5;
          vShade = mix(0.18, 1.0, lambert) * (0.72 + 0.28 * fract(aSeed * 13.7));
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vShade;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          if (dot(c, c) > 0.25) discard;
          vec3 col = mix(vec3(0.03, 0.035, 0.045), vec3(0.8, 0.82, 0.86), vShade * vShade);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }
      `,
    })
    this.points = new THREE.Points(geo, mat)
    this.points.frustumCulled = false
    this.sculpture.add(this.points)
    this.sculpture.position.y = 0.92
    this.sculpture.scale.setScalar(1.18)
    this.group.add(this.sculpture)
  }

  /** FAQ carousel selection. */
  setFaq(index: number) {
    this.faqShape = index % (this.shapes.length - 1)
  }

  private setShape(i: number) {
    if (i === this.shape) return
    // Bake the in-between positions into aFrom so a morph can start mid-morph.
    const from = this.from.array as Float32Array
    const to = this.to.array as Float32Array
    const m = this.uniforms.uMorph.value
    for (let k = 0; k < this.seeds.length; k++) {
      const s = this.seeds[k]
      const t = smoothstep(s * 0.35, 0.65 + s * 0.35, m)
      const o = k * 3
      from[o] += (to[o] - from[o]) * t
      from[o + 1] += (to[o + 1] - from[o + 1]) * t
      from[o + 2] += (to[o + 2] - from[o + 2]) * t
    }
    to.set(this.shapes[i])
    this.from.needsUpdate = true
    this.to.needsUpdate = true
    this.shape = i
    this.morph = 0
    this.onMorph?.()
  }

  pick(raycaster: THREE.Raycaster) {
    // Particles part around the cursor on a plane through the form.
    this.plane.normal.set(0, 0, 1).applyQuaternion(this.sculpture.quaternion)
    this.plane.constant = 0
    this.hasPointer = raycaster.ray.intersectPlane(this.plane, this.hit) !== null
    if (this.hasPointer) this.sculpture.worldToLocal(this.hit)
    return false
  }

  clearHover() {
    this.hasPointer = false
  }

  update(ctx: FrameCtx) {
    const { p, time, dt } = ctx
    sampleKeys(KEYS, p, ctx.cam)
    if (ctx.portrait) pullBack(ctx.cam, 1.4, -1.4)

    this.setShape(p >= T.faqEnd - 0.005 ? MARK_SHAPE : this.faqShape)
    this.morph = Math.min(1, this.morph + dt / MORPH_SECONDS)
    const u = this.uniforms
    u.uMorph.value = this.morph
    u.uTime.value = time
    u.uPR.value = Math.min(window.devicePixelRatio, 2)
    u.uScatter.value = 1 - smoothstep(T.portalEnd, 0.8, p)
    u.uPointerOn.value += ((this.hasPointer ? 1 : 0) - u.uPointerOn.value) * Math.min(1, dt * 6)
    if (this.hasPointer) u.uPointer.value.copy(this.hit)

    const settle = smoothstep(T.faqEnd, 0.93, p)
    const spin = time * 0.16 + ctx.pointer.x * 0.35
    this.sculpture.rotation.y = spin * (1 - settle) + Math.sin(time * 0.35) * 0.3 * settle
    this.halo.position.y = 9.4 + Math.sin(time * 0.5) * 0.15
  }

  project(ctx: FrameCtx) {
    ctx.hud.labels.length = 0
    ctx.hud.constellation.pts.length = 0
  }
}
