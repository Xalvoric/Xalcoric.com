import { SCROLL_VH, toScroll, toTimeline } from './config'
import { clamp, damp } from './util'

// Native page scroll drives the experience: no scroll hijacking, so wheel,
// trackpad, touch, keyboard and the scrollbar all work. The scene reads a
// damped copy of the progress for its inertia.

export class ScrollDriver {
  target = 0
  current = 0
  /** Extra whiteout (0..1) while a long navigation jump cuts between stages. */
  cut = 0
  private cutState: { phase: 'in' | 'out'; t: number; to: number } | null = null

  constructor(space: HTMLElement) {
    const unit = CSS.supports('height', '1lvh') ? 'lvh' : 'vh'
    space.style.height = `${SCROLL_VH}${unit}`
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual'
    window.scrollTo(0, 0)
    window.addEventListener('scroll', this.read, { passive: true })
    let lastW = window.innerWidth
    window.addEventListener('resize', () => {
      // Keep the visitor at the same point in the sequence, not the same pixel.
      if (window.innerWidth === lastW) return
      lastW = window.innerWidth
      const keep = this.target
      requestAnimationFrame(() => window.scrollTo(0, toScroll(keep) * this.max))
    })
    this.read()
  }

  get max() {
    return Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
  }

  private read = () => {
    this.target = toTimeline(clamp(window.scrollY / this.max))
  }

  /** Long jumps fade to fog, cut, and fade back instead of rushing through every stage. */
  jumpTo(p: number, reduced = false) {
    const y = toScroll(p) * this.max
    if (reduced || Math.abs(p - this.current) < 0.06) {
      window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' })
      return
    }
    this.cutState = { phase: 'in', t: 0, to: p }
    window.scrollTo(0, y)
    this.target = p
  }

  update(dt: number) {
    const c = this.cutState
    if (c) {
      c.t += dt
      if (c.phase === 'in') {
        this.cut = Math.min(1, c.t / 0.35)
        if (c.t >= 0.35) {
          this.current = c.to
          c.phase = 'out'
          c.t = 0
        }
        return
      }
      this.cut = Math.max(0, 1 - c.t / 0.55)
      if (c.t >= 0.55) this.cutState = null
    }
    this.current = damp(this.current, this.target, 4.2, dt)
    if (Math.abs(this.current - this.target) < 1e-5) this.current = this.target
  }
}
