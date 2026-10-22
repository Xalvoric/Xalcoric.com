import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { T } from '../config'
import { mulberry32, smoothstep } from '../util'
import { pullBack, sampleKeys, type CamKey } from './keys'
import { createNoise3D } from './noise'
import { anchor, toScreen, type FrameCtx, type Stage, type StageAction } from './stage'
import { glyphTexture, radialTexture, textTexture } from './textures'

// Chapters 02 and 03: a fog void above the cloud line. Three shards hold the
// services; past them, four broken rings (one per process step) lead into a
// light that whites out into the room.

const SHARD_Z = [-14, -34, -54]
const SHARD_SIDE = [1, -1, 1]
const SHARD_GLYPHS = ['</>', 'AI', '▶']
const RING_Z = [-80, -96, -112, -128]
const GLOW_Z = -150

/** Background words for the blurred text drift, all from the studio's own copy. */
const DRIFT_WORDS = [
  'XALVORIC // DIGITAL STUDIO',
  'WEBSITES / AI AGENTS / PRODUCT ADS',
  '01 STRUCTURE  02 DESIGN  03 BUILD',
  '01 MAP  02 AGENTS  03 REVIEW',
  '01 CONCEPTS  02 SCENES  03 VARIANTS',
  'SCOPE → SHAPE → BUILD → LAUNCH',
  'ONE STUDIO. ONE STANDARD.',
  'SVC_01 // WEBSITE DEVELOPMENT',
  'SVC_02 // AI AGENCY',
  'SVC_03 // AD GENERATION',
  'WE BUILD WHAT MOVES YOUR BUSINESS',
  'STATUS: SCOPING // OPEN',
]

function camKeys(portrait: boolean): CamKey[] {
  const sx = portrait ? 0 : 1
  const keys: CamKey[] = [
    { t: T.surfaceEnd, pos: [0, 9, 26], look: [0, 2, -10] },
    { t: 0.195, pos: [0, 1.3, 10], look: [0, 0.6, -14] },
  ]
  T.shards.forEach((f, i) => {
    const z = SHARD_Z[i]
    const lx = SHARD_SIDE[i] * 0.95 * sx
    keys.push({ t: f - 0.024, pos: [0, 0.35, z + 8.4], look: [lx, 0, z] })
    keys.push({ t: f + 0.024, pos: [0, 0.25, z + 7.2], look: [lx, 0, z] })
  })
  keys.push({ t: 0.475, pos: [0, 0.4, -62], look: [0, 0, -92] })
  T.rings.forEach((r, i) => {
    keys.push({ t: r, pos: [0, 0, RING_Z[i] + 0.5], look: [0, 0, RING_Z[i] - 24], roll: (i + 1) * 0.45, ease: 'lin' })
  })
  keys.push({ t: T.portalEnd, pos: [0, 0, GLOW_Z + 6], look: [0, 0, GLOW_Z - 30], roll: 2.4, ease: 'lin' })
  return keys
}

type Shard = {
  group: THREE.Group
  mesh: THREE.Mesh
  halo: THREE.Sprite
  hover: number
  base: THREE.Vector3
}

export class VoidStage implements Stage {
  group = new THREE.Group()
  fogColor = new THREE.Color('#b2b7c1')
  fogDensity = 0.03
  skyTop = new THREE.Color('#ced2d9')
  skyBottom = new THREE.Color('#959ba7')

  private shards: Shard[] = []
  private drift: { mesh: THREE.Mesh; base: THREE.Vector3; seed: number; mat: THREE.MeshBasicMaterial; o: number }[] = []
  private rings: THREE.Group[] = []
  private glow!: THREE.Group
  private glowLight!: THREE.PointLight
  private keysLand: CamKey[] = []
  private keysPortrait: CamKey[] = []
  private hovered = -1
  private v = new THREE.Vector3()

  build() {
    this.keysLand = camKeys(false)
    this.keysPortrait = camKeys(true)
    const hemi = new THREE.HemisphereLight('#f4f6fa', '#5a606b', 1.25)
    const key = new THREE.DirectionalLight('#ffffff', 1.4)
    key.position.set(6, 9, 8)
    const rim = new THREE.DirectionalLight('#e8eef8', 1.4)
    rim.position.set(-7, 3, -12)
    this.group.add(hemi, key, rim)
    this.buildDrift()
    this.buildShards()
    this.buildRings()
  }

  private buildDrift() {
    const rand = mulberry32(19)
    const textures = DRIFT_WORDS.map((w) => textTexture(w, { size: 64, blur: 5 + rand() * 4 }))
    for (let i = 0; i < 46; i++) {
      const { tex, aspect } = textures[i % textures.length]
      const h = 0.9 + rand() * 2.2
      const mat = new THREE.MeshBasicMaterial({
        map: tex,
        transparent: true,
        depthWrite: false,
        color: rand() > 0.45 ? '#ffffff' : '#3d424c',
        opacity: 0,
      })
      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(h * aspect, h), mat)
      const a = rand() * Math.PI * 2
      const r = 9 + rand() * 13
      const z = 14 - rand() * 150
      mesh.position.set(Math.cos(a) * r, Math.sin(a) * r * 0.55 + (rand() - 0.5) * 3, z)
      mesh.lookAt(0, mesh.position.y * 0.6, z + 6)
      this.group.add(mesh)
      this.drift.push({ mesh, base: mesh.position.clone(), seed: rand(), mat, o: 0.18 + rand() * 0.32 })
    }
  }

  private buildShards() {
    const noise = createNoise3D(5)
    const halo = radialTexture(256, [
      [0, 'rgba(255,255,255,0.9)'],
      [0.3, 'rgba(255,255,255,0.35)'],
      [1, 'rgba(255,255,255,0)'],
    ])
    SHARD_Z.forEach((z, i) => {
      const geo = new THREE.IcosahedronGeometry(1.5, 1)
      const pos = geo.attributes.position as THREE.BufferAttribute
      for (let k = 0; k < pos.count; k++) {
        const x = pos.getX(k)
        const y = pos.getY(k)
        const zz = pos.getZ(k)
        const d = 1 + noise(x * 0.9 + i * 3, y * 0.9, zz * 0.9) * 0.38
        pos.setXYZ(k, x * d * 0.82, y * d * 1.45, zz * d * 0.62)
      }
      geo.computeVertexNormals()
      const mat = new THREE.MeshPhysicalMaterial({
        color: '#5f6672',
        roughness: 0.32,
        metalness: 0.2,
        clearcoat: 0.7,
        clearcoatRoughness: 0.3,
        flatShading: true,
        envMapIntensity: 0.85,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0,
      })
      const mesh = new THREE.Mesh(geo, mat)
      const edges = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 18),
        new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.22 }),
      )
      edges.scale.setScalar(1.07)
      const glyph = new THREE.Mesh(
        new THREE.PlaneGeometry(1.15, 1.15),
        new THREE.MeshBasicMaterial({
          map: glyphTexture(SHARD_GLYPHS[i]),
          transparent: true,
          opacity: 0.85,
          depthWrite: false,
          depthTest: false,
          blending: THREE.AdditiveBlending,
        }),
      )
      glyph.renderOrder = 2
      glyph.position.set(0, 0.1, 1.3)
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({ map: halo, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending }),
      )
      sprite.scale.setScalar(7)
      sprite.position.z = -1.2
      const group = new THREE.Group()
      group.add(sprite, mesh, edges, glyph)
      const base = new THREE.Vector3(SHARD_SIDE[i] * 2.5, 0, z)
      group.position.copy(base)
      this.group.add(group)
      this.shards.push({ group, mesh, halo: sprite, hover: 0, base })
    })
  }

  private buildRings() {
    const noise = createNoise3D(9)
    const rand = mulberry32(77)
    const mat = new THREE.MeshStandardMaterial({
      color: '#8f96a1',
      roughness: 0.5,
      metalness: 0.2,
      flatShading: true,
      envMapIntensity: 0.7,
    })
    const seamMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.25, 2.4) })
    RING_Z.forEach((z, i) => {
      const R = 5.4 + i * 0.5
      const tube = 0.62
      const parts: THREE.BufferGeometry[] = []
      const nSeg = 20 + i * 2
      for (let j = 0; j < nSeg; j++) {
        const arc = ((Math.PI * 2) / nSeg) * (0.7 + rand() * 0.22)
        let g: THREE.BufferGeometry = new THREE.TorusGeometry(R + (rand() - 0.5) * 0.4, tube * (0.75 + rand() * 0.5), 5, 5, arc)
        g = g.toNonIndexed()
        const p = g.attributes.position as THREE.BufferAttribute
        for (let k = 0; k < p.count; k++) {
          const x = p.getX(k)
          const y = p.getY(k)
          const zz = p.getZ(k)
          const d = noise(x * 0.8 + j, y * 0.8, zz * 0.8 + i * 5) * 0.22
          p.setXYZ(k, x * (1 + d * 0.15), y * (1 + d * 0.15), zz + d)
        }
        g.rotateZ(((Math.PI * 2) / nSeg) * j)
        g.rotateX((rand() - 0.5) * 0.12)
        g.translate(0, 0, (rand() - 0.5) * 0.9)
        g.computeVertexNormals()
        parts.push(g)
      }
      const merged = mergeGeometries(parts)
      const ring = new THREE.Group()
      ring.add(new THREE.Mesh(merged, mat))
      const seam = new THREE.Mesh(new THREE.TorusGeometry(R - tube * 0.9, 0.025, 4, 160), seamMat)
      ring.add(seam)
      ring.position.z = z
      this.group.add(ring)
      this.rings.push(ring)
    })

    this.glow = new THREE.Group()
    const glowTex = radialTexture(512, [
      [0, 'rgba(255,255,255,1)'],
      [0.18, 'rgba(255,255,255,0.75)'],
      [0.5, 'rgba(255,255,255,0.18)'],
      [1, 'rgba(255,255,255,0)'],
    ])
    const big = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: glowTex, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, opacity: 0.9 }),
    )
    big.scale.setScalar(60)
    const core = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        fog: false,
        color: new THREE.Color(2, 2, 2),
      }),
    )
    core.scale.setScalar(12)
    this.glow.add(big, core)
    this.glow.position.z = GLOW_Z
    this.glowLight = new THREE.PointLight('#ffffff', 0, 120, 1.1)
    this.glowLight.position.z = GLOW_Z + 10
    this.group.add(this.glow, this.glowLight)
  }

  pick(raycaster: THREE.Raycaster) {
    this.hovered = -1
    for (let i = 0; i < this.shards.length; i++) {
      if (raycaster.intersectObject(this.shards[i].mesh, false).length) {
        this.hovered = i
        return true
      }
    }
    return false
  }

  click(): StageAction | null {
    return this.hovered >= 0 ? { type: 'service', index: this.hovered } : null
  }

  clearHover() {
    this.hovered = -1
  }

  update(ctx: FrameCtx) {
    const { p, time, dt } = ctx
    sampleKeys(ctx.portrait ? this.keysPortrait : this.keysLand, p, ctx.cam)
    if (ctx.portrait) pullBack(ctx.cam, 1.35, -0.9)

    const fadeIn = smoothstep(T.surfaceEnd, 0.2, p)
    for (const d of this.drift) {
      d.mesh.position.x = d.base.x + Math.sin(time * 0.07 + d.seed * 20) * 1.2
      d.mesh.position.y = d.base.y + Math.cos(time * 0.05 + d.seed * 31) * 0.8
      const flicker = 0.75 + 0.25 * Math.sin(time * (0.6 + d.seed) + d.seed * 50)
      d.mat.opacity = d.o * flicker * fadeIn
    }

    this.shards.forEach((s, i) => {
      s.hover += ((this.hovered === i ? 1 : 0) - s.hover) * Math.min(1, dt * 8)
      const near = 1 - smoothstep(0.03, 0.07, Math.abs(p - T.shards[i]))
      s.group.position.copy(s.base)
      if (ctx.portrait) s.group.position.set(0, 1.4, s.base.z)
      s.group.position.y += Math.sin(time * 0.6 + i * 2) * 0.18
      s.mesh.rotation.y = Math.sin(time * 0.25 + i) * 0.45 + s.hover * 0.4 + time * 0.05
      s.mesh.rotation.x = Math.sin(time * 0.31 + i * 3) * 0.12
      ;(s.mesh.material as THREE.MeshPhysicalMaterial).emissiveIntensity = 0.04 + s.hover * 0.14
      s.halo.material.opacity = 0.12 + near * 0.18 + s.hover * 0.3
      s.group.scale.setScalar(1 + s.hover * 0.06)
    })

    this.rings.forEach((r, i) => {
      r.rotation.z = time * (i % 2 ? -0.05 : 0.07) + i
    })
    const approach = smoothstep(0.47, T.portalEnd, p)
    this.glowLight.intensity = 140 * approach
    this.glow.scale.setScalar(0.5 + approach * 0.7)
  }

  project(ctx: FrameCtx) {
    const hud = ctx.hud
    hud.labels.length = 0
    hud.constellation.pts.length = 0
    this.shards.forEach((s, i) => {
      // Anchor on the shard edge facing the overlay box.
      const side = ctx.portrait ? 0 : -SHARD_SIDE[i]
      this.v.copy(s.group.position).add(new THREE.Vector3(side * 1.2, ctx.portrait ? -1.6 : 0.5, 0.3))
      toScreen(this.v, ctx, anchor(hud, `service-${i}`))
    })
    // Each step points at the ring ahead of the camera (the one it is about to
    // pass is already too close to frame); the last step points into the light.
    this.rings.forEach((_, i) => {
      const side = i % 2 === 0 ? -1 : 1
      const next = this.rings[i + 1]
      if (next) {
        const R = 5.4 + (i + 1) * 0.5 - 0.6
        const ang = side < 0 ? Math.PI * 0.8 : Math.PI * 0.2
        this.v.set(Math.cos(ang) * R, Math.sin(ang) * R, next.position.z)
      } else {
        this.v.set(side * 3, 2, GLOW_Z + 8)
      }
      toScreen(this.v, ctx, anchor(hud, `step-${i}`))
    })
  }
}
