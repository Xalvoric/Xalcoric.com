import * as THREE from 'three'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { T } from '../config'
import { damp, nextFrame, smoothstep, whiteoutAt } from '../util'
import { VALUE_NOISE } from './glsl'
import { createPost, type Post } from './post'
import { Room } from './room'
import type { FrameCtx, HudFrame, Stage, StageAction } from './stage'
import { Surface } from './surface'
import { VoidStage } from './voidStage'

export type Tier = 'high' | 'low'

export class Experience {
  readonly renderer: THREE.WebGLRenderer
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 1200)
  readonly hud: HudFrame = { anchors: {}, labels: [], constellation: { pts: [], o: 0 } }
  readonly surface: Surface
  readonly voidStage: VoidStage
  readonly room: Room
  onAction: ((a: StageAction) => void) | null = null
  /** Fires when the stage changes, for ambient sound. */
  onStage: ((name: 'surface' | 'void' | 'room') => void) | null = null

  private post!: Post
  private sky!: THREE.Mesh
  private skyUniforms = {
    uTop: { value: new THREE.Color() },
    uBottom: { value: new THREE.Color() },
    uTime: { value: 0 },
  }
  private fog = new THREE.FogExp2('#9da3ae', 0.02)
  private active: Stage
  private stages: Stage[]
  private ctx: FrameCtx
  private pointerRaw = new THREE.Vector2()
  private pointerIn = false
  private pointerMouse = false
  private raycaster = new THREE.Raycaster()
  private dpr = 1
  private maxDpr: number
  private frameTimes: number[] = []
  private lastPick = 0
  private width = 1
  private height = 1

  constructor(
    private canvas: HTMLCanvasElement,
    tier: Tier,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.92
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.maxDpr = tier === 'high' ? 1.5 : 1.15
    this.surface = new Surface(tier)
    this.voidStage = new VoidStage()
    this.room = new Room(tier)
    this.stages = [this.surface, this.voidStage, this.room]
    this.active = this.surface
    this.ctx = {
      p: 0,
      time: 0,
      dt: 0,
      intro: 0,
      pointer: new THREE.Vector2(),
      portrait: false,
      cam: { pos: new THREE.Vector3(), look: new THREE.Vector3(), roll: 0 },
      camera: this.camera,
      width: 1,
      height: 1,
      hud: this.hud,
    }
  }

  /** Builds everything, reporting 0..1 progress, and precompiles shaders per stage. */
  async build(progress: (v: number) => void) {
    const pmrem = new THREE.PMREMGenerator(this.renderer)
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
    pmrem.dispose()
    this.scene.fog = this.fog
    this.buildSky()
    progress(0.1)
    await nextFrame()

    this.surface.build()
    progress(0.35)
    await nextFrame()
    this.voidStage.build()
    progress(0.5)
    await nextFrame()
    this.room.build()
    progress(0.62)
    await nextFrame()

    for (const s of this.stages) this.scene.add(s.group)
    this.resize()
    this.post = createPost(this.renderer, this.scene, this.camera, true)
    this.post.setSize(this.width, this.height, this.dpr)

    // Compile each stage with its own lights so switching stages never stalls.
    let i = 0
    for (const s of this.stages) {
      for (const o of this.stages) o.group.visible = o === s
      this.applyStageLook(s)
      this.ctx.p = s === this.surface ? 0 : s === this.voidStage ? 0.3 : 0.85
      s.update(this.ctx)
      this.placeCamera()
      try {
        await this.renderer.compileAsync(this.scene, this.camera)
      } catch {
        this.renderer.compile(this.scene, this.camera)
      }
      this.post.composer.render(0)
      progress(0.62 + (++i / this.stages.length) * 0.38)
      await nextFrame()
    }
    this.setActive(this.surface)
    this.bindPointer()
  }

  private buildSky() {
    const mat = new THREE.ShaderMaterial({
      uniforms: this.skyUniforms,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uTop;
        uniform vec3 uBottom;
        uniform float uTime;
        varying vec3 vDir;
        ${VALUE_NOISE}
        void main() {
          float h = vDir.y;
          vec3 col = mix(uBottom, uTop, smoothstep(-0.25, 0.6, h));
          vec2 uv = vDir.xz / (abs(vDir.y) + 0.35);
          float c = fbm(uv * 1.6 + vec2(uTime * 0.012, 0.0));
          col += (c - 0.5) * 0.07;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    })
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16), mat)
    this.sky.frustumCulled = false
    this.sky.renderOrder = -1
    this.scene.add(this.sky)
  }

  private bindPointer() {
    window.addEventListener('pointermove', (e) => {
      this.pointerRaw.set((e.clientX / this.width) * 2 - 1, -(e.clientY / this.height) * 2 + 1)
      this.pointerIn = true
      this.pointerMouse = e.pointerType === 'mouse'
    })
    document.documentElement.addEventListener('pointerleave', () => {
      this.pointerIn = false
    })
    this.canvas.addEventListener('click', (e) => {
      this.pointerRaw.set((e.clientX / this.width) * 2 - 1, -(e.clientY / this.height) * 2 + 1)
      this.pointerIn = true
      this.pick()
      const action = this.active.click?.() ?? null
      if (action) this.onAction?.(action)
    })
  }

  private pick() {
    if (!this.active.pick) return false
    this.raycaster.setFromCamera(this.pointerRaw, this.camera)
    const hit = this.active.pick(this.raycaster)
    this.canvas.style.cursor = hit ? 'pointer' : ''
    return hit
  }

  private setActive(s: Stage) {
    this.active = s
    for (const o of this.stages) o.group.visible = o === s
    this.applyStageLook(s)
    this.canvas.style.cursor = ''
    this.onStage?.(s === this.surface ? 'surface' : s === this.voidStage ? 'void' : 'room')
  }

  private applyStageLook(s: Stage) {
    this.fog.color.copy(s.fogColor)
    this.fog.density = s.fogDensity
    this.skyUniforms.uTop.value.copy(s.skyTop)
    this.skyUniforms.uBottom.value.copy(s.skyBottom)
    this.renderer.setClearColor(s.fogColor)
  }

  resize() {
    this.width = window.innerWidth
    this.height = window.innerHeight
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr)
    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setSize(this.width, this.height, false)
    const aspect = this.width / this.height
    this.camera.aspect = aspect
    // Keep roughly the same horizontal view on narrow screens, within reason.
    const hFov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(20)) * 1.6)
    const vFov = aspect < 1.6 ? 2 * Math.atan(Math.tan(hFov / 2) / aspect) : THREE.MathUtils.degToRad(40)
    this.camera.fov = Math.min(THREE.MathUtils.radToDeg(vFov), 68)
    this.camera.updateProjectionMatrix()
    this.ctx.width = this.width
    this.ctx.height = this.height
    this.ctx.portrait = aspect < 0.85
    this.post?.setSize(this.width, this.height, this.dpr)
  }

  private placeCamera() {
    const { cam, pointer } = this.ctx
    this.camera.position.copy(cam.pos)
    // Cursor parallax: shift the eye slightly, keep the target.
    this.camera.position.x += pointer.x * 0.55
    this.camera.position.y += pointer.y * 0.3
    this.camera.lookAt(cam.look)
    if (cam.roll) this.camera.rotateZ(cam.roll)
    this.camera.updateMatrixWorld()
  }

  /** Renders one frame. `cut` is extra whiteout from navigation jumps. */
  frame(dt: number, time: number, p: number, intro: number, cut: number) {
    const ctx = this.ctx
    ctx.dt = dt
    ctx.time = time
    ctx.p = p
    ctx.intro = intro
    const target = this.pointerIn && this.pointerMouse ? this.pointerRaw : ZERO
    ctx.pointer.x = damp(ctx.pointer.x, target.x, 3, dt)
    ctx.pointer.y = damp(ctx.pointer.y, target.y, 3, dt)

    const next = p < T.surfaceEnd ? this.surface : p < T.portalEnd ? this.voidStage : this.room
    if (next !== this.active) this.setActive(next)

    this.active.update(ctx)
    this.placeCamera()

    // Pointer picking at most every other frame, only with a mouse in the window.
    if (this.pointerIn && this.pointerMouse && time - this.lastPick > 0.03 && intro >= 1) {
      this.lastPick = time
      this.pick()
    } else if (!this.pointerIn) {
      ;(this.active as { clearHover?: () => void }).clearHover?.()
    }

    this.active.project(ctx)

    // Fog thickens through the intro and at each whiteout.
    const introFog = 1 - smoothstep(0.35, 0.95, intro)
    const w = Math.max(whiteoutAt(p), cut, introFog * 0.85)
    this.fog.density = this.active.fogDensity * (1 + introFog * 2.5 + w * 2)
    this.skyUniforms.uTime.value = time
    const u = this.post.final.uniforms
    u.uTime.value = time
    u.uWhite.value = Math.max(whiteoutAt(p), cut) * 0.97
    // Matches the loader grey during the intro, near-white for stage cuts (display space).
    u.uWhiteColor.value.setHex(intro < 1 ? 0x9da3ae : 0xe3e6eb, THREE.LinearSRGBColorSpace)
    if (intro < 1) u.uWhite.value = Math.max(u.uWhite.value, introFog * 0.9)
    this.post.composer.render(dt)
    this.adapt(dt, intro)
  }

  /** If the first seconds after the intro run slow, step quality down once or twice. */
  private adapt(dt: number, intro: number) {
    if (intro < 1 || this.frameTimes.length > 240) return
    this.frameTimes.push(dt)
    if (this.frameTimes.length % 90 !== 0) return
    const recent = this.frameTimes.slice(-90).sort((a, b) => a - b)
    const median = recent[45]
    if (median > 1 / 38) {
      if (this.maxDpr > 1) {
        this.maxDpr = 1
        this.resize()
      } else if (this.post.bloom.enabled) {
        this.post.bloom.enabled = false
      }
    }
  }

  dispose() {
    this.renderer.dispose()
  }
}

const ZERO = new THREE.Vector2()
