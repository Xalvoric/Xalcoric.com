import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/500.css'
import '@fontsource/unbounded/500.css'
import '@fontsource/unbounded/700.css'
import './styles.css'

import { Sound } from './audio'
import type { Tier } from './gl/Experience'
import { Hud } from './hud'
import { Loader } from './loader'
import { prepareScramble, scrambleWithin } from './scramble'
import { ScrollDriver } from './scroll'
import { initUI } from './ui'
import { smoothstep } from './util'

const INTRO_SECONDS = 5.6

const root = document.documentElement
const params = new URLSearchParams(location.search)
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || params.get('motion') === 'off'

function webglAvailable() {
  try {
    return !!document.createElement('canvas').getContext('webgl2')
  } catch {
    return false
  }
}

function pickTier(): Tier {
  if (params.get('quality') === 'low') return 'low'
  const nav = navigator as Navigator & { deviceMemory?: number }
  const mem = nav.deviceMemory ?? 8
  const cores = nav.hardwareConcurrency ?? 8
  const small = Math.min(screen.width, screen.height) < 600
  return mem < 4 || cores < 4 || small ? 'low' : 'high'
}

const wantGL = params.get('gl') === 'on' || (params.get('gl') !== 'off' && !reduced && webglAvailable())

prepareScramble()
const sound = new Sound()

if (wantGL) void startGL()
else startStatic()

/** The plain document: same content and styling, no WebGL, no scroll sequence. */
function startStatic() {
  root.classList.remove('gl', 'locked')
  root.classList.add('static', 'is-ready')
  document.getElementById('loader')?.remove()
  initUI({ gl: false, sound, reduced })
}

async function startGL() {
  root.classList.add('gl', 'locked')
  const loader = new Loader(document.getElementById('loader')!)
  const canvas = document.getElementById('gl') as HTMLCanvasElement
  const scroll = new ScrollDriver(document.getElementById('scroll-space')!)
  const hud = new Hud()
  loader.set(0.05)

  await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))])
  loader.set(0.12)

  let exp: import('./gl/Experience').Experience
  try {
    const { Experience } = await import('./gl/Experience')
    loader.set(0.22)
    exp = new Experience(canvas, pickTier())
    await exp.build((v) => loader.set(0.22 + v * 0.78))
  } catch (err) {
    console.error('WebGL experience failed to start; showing the static page.', err)
    loader.hide()
    canvas.remove()
    startStatic()
    return
  }

  const ui = initUI({
    gl: true,
    sound,
    reduced,
    scroll,
    opacityOf: (k) => hud.opacityOf(k),
    onFaq: (i) => exp.room.setFaq(i),
  })
  exp.onAction = (a) => {
    if (a.type === 'service') ui.openService(a.index)
  }
  exp.onStage = (s) => sound.setMood(s)
  exp.room.onMorph = () => sound.blip('morph')

  let running = true
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    running = false
    hud.reset()
    canvas.remove()
    root.classList.remove('gl', 'locked')
    root.classList.add('static', 'is-ready')
  })

  window.addEventListener('resize', () => exp.resize())

  await loader.finish()

  // Intro plays on a clock; any input speeds it up. `?skip` starts after it.
  let intro = params.has('skip') ? 0.999 : 0
  let speed = 1
  let introDone = false
  const hurry = () => (speed = 3.2)
  for (const ev of ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const) {
    window.addEventListener(ev, hurry, { passive: true, once: true })
  }

  let last = performance.now()
  let time = 0
  const tick = (now: number) => {
    if (!running) return
    requestAnimationFrame(tick)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (document.hidden) return
    time += dt
    if (intro < 1) {
      intro = Math.min(1, intro + (dt * speed) / INTRO_SECONDS)
      if (intro >= 1 && !introDone) {
        introDone = true
        root.classList.remove('locked')
        root.classList.add('is-ready')
        scrambleWithin(document.querySelector('.chrome')!)
        scrambleWithin(document.querySelector('.chrome__bottom')!)
      }
    }
    scroll.update(dt)
    exp.frame(dt, time, scroll.current, intro, scroll.cut)
    hud.update(scroll.current, smoothstep(0.86, 1, intro), exp.hud)
  }
  requestAnimationFrame(tick)
}
