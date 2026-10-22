import { damp } from './util'

// The percentage counts toward real build progress (fonts, the 3D chunk,
// geometry, shader compiles) but never faster than a steady pace, so it reads
// as a counter rather than a flash.

export class Loader {
  private shown = 0
  private target = 0
  private raf = 0
  private last = performance.now()
  private pct: HTMLElement
  private bar: HTMLElement
  private resolveDone: (() => void) | null = null

  constructor(private el: HTMLElement) {
    this.pct = el.querySelector('[data-pct]') as HTMLElement
    this.bar = el.querySelector('[data-bar]') as HTMLElement
    this.raf = requestAnimationFrame(this.tick)
  }

  set(v: number) {
    this.target = Math.max(this.target, Math.min(1, v))
  }

  private tick = (now: number) => {
    const dt = Math.min(0.1, (now - this.last) / 1000)
    this.last = now
    const next = damp(this.shown, this.target, 5, dt)
    this.shown = Math.min(next, this.shown + dt * 0.9)
    if (this.target >= 1 && this.target - this.shown < 0.004) this.shown = 1
    const v = Math.round(this.shown * 100)
    this.pct.textContent = String(v).padStart(3, '0')
    this.bar.style.transform = `scaleX(${this.shown})`
    if (this.shown >= 1 && this.resolveDone) {
      this.resolveDone()
      this.resolveDone = null
    }
    this.raf = requestAnimationFrame(this.tick)
  }

  /** Waits for the counter to reach 100, then plays the exit. */
  async finish() {
    this.set(1)
    if (this.shown < 1) await new Promise<void>((r) => (this.resolveDone = r))
    this.el.classList.add('is-done')
    await new Promise((r) => setTimeout(r, 650))
    cancelAnimationFrame(this.raf)
    this.el.remove()
  }

  hide() {
    cancelAnimationFrame(this.raf)
    this.el.remove()
  }
}
