import { chapterAt, CHAPTERS, WINDOWS } from './config'
import type { HudFrame } from './gl/stage'
import { scrambleWithin } from './scramble'
import { windowOpacity } from './util'

// The HTML layer over the canvas: fades each overlay in its scroll window,
// types in mono labels as they appear, and draws leader lines from overlay
// boxes to points in the scene (positions come from the WebGL stages).

const SVG = 'http://www.w3.org/2000/svg'

type Win = {
  el: HTMLElement
  key: string
  o: number
  shown: boolean
  line?: SVGPolylineElement
  dot?: SVGCircleElement
}

export class Hud {
  private wins: Win[]
  private labelsRoot: HTMLElement
  private labelEls = new Map<string, HTMLSpanElement>()
  private constellation: SVGPolylineElement
  private statusChapter: HTMLElement | null
  private statusPct: HTMLElement | null
  private lastChapter = ''
  private lastPct = -1
  private navLinks: HTMLAnchorElement[]

  constructor() {
    const svg = document.getElementById('hud-lines') as unknown as SVGSVGElement
    this.labelsRoot = document.getElementById('hud-labels') as HTMLElement
    this.constellation = document.createElementNS(SVG, 'polyline')
    this.constellation.setAttribute('class', 'hud-constellation')
    svg.appendChild(this.constellation)

    this.wins = [...document.querySelectorAll<HTMLElement>('[data-window]')].map((el) => {
      const key = el.dataset.window ?? ''
      const w: Win = { el, key, o: -1, shown: false }
      if (key.startsWith('service-') || key.startsWith('step-')) {
        w.line = document.createElementNS(SVG, 'polyline')
        w.line.setAttribute('class', 'hud-leader')
        w.dot = document.createElementNS(SVG, 'circle')
        w.dot.setAttribute('class', 'hud-dot')
        w.dot.setAttribute('r', '3.5')
        svg.append(w.line, w.dot)
      }
      return w
    })
    this.statusChapter = document.querySelector('[data-status-chapter]')
    this.statusPct = document.querySelector('[data-status-pct]')
    this.navLinks = [...document.querySelectorAll<HTMLAnchorElement>('.chrome__nav a[data-jump]')]
  }

  /** Opacity of a window at progress p, for focus handling in the UI. */
  opacityOf(key: string) {
    return this.wins.find((w) => w.key === key)?.o ?? 0
  }

  update(p: number, reveal: number, frame: HudFrame) {
    for (const w of this.wins) {
      const range = WINDOWS[w.key]
      if (!range) continue
      let o = windowOpacity(range, p)
      if (w.key === 'hero' || w.key === 'hint') o *= reveal
      if (Math.abs(o - w.o) > 0.002) {
        w.el.style.opacity = o.toFixed(3)
        w.el.classList.toggle('is-live', o > 0.5)
        w.o = o
      }
      if (o > 0.4 && !w.shown) {
        w.shown = true
        scrambleWithin(w.el)
      } else if (o < 0.02) {
        w.shown = false
      }
      if (w.line && w.dot) this.drawLeader(w, frame)
    }
    this.drawLabels(frame)
    this.drawStatus(p)
  }

  private drawLeader(w: Win, frame: HudFrame) {
    const line = w.line!
    const dot = w.dot!
    const a = frame.anchors[w.key]
    if (!a || !a.on || w.o < 0.02) {
      line.style.opacity = '0'
      dot.style.opacity = '0'
      return
    }
    const r = w.el.getBoundingClientRect()
    let pts: string
    if (a.y < r.top - 16 && a.x > r.left - 40 && a.x < r.right + 40) {
      // Anchor above the box (phones): leave from the top edge.
      const sx = r.left + 14
      const sy = r.top - 10
      pts = `${sx},${sy} ${sx},${sy - 22} ${a.x},${a.y}`
    } else {
      const right = a.x > r.left + r.width / 2
      const sx = right ? r.right + 12 : r.left - 12
      const sy = r.top + 14
      const ex = sx + (right ? 30 : -30)
      pts = `${sx},${sy} ${ex},${sy} ${a.x},${a.y}`
    }
    line.setAttribute('points', pts)
    dot.setAttribute('cx', a.x.toFixed(1))
    dot.setAttribute('cy', a.y.toFixed(1))
    const o = w.o.toFixed(3)
    line.style.opacity = o
    dot.style.opacity = o
  }

  private drawLabels(frame: HudFrame) {
    const seen = new Set<string>()
    for (const l of frame.labels) {
      seen.add(l.key)
      let el = this.labelEls.get(l.key)
      if (!el) {
        el = document.createElement('span')
        el.className = 'hud-label'
        this.labelsRoot.appendChild(el)
        this.labelEls.set(l.key, el)
      }
      if (el.textContent !== l.text) el.textContent = l.text
      el.style.transform = `translate3d(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px, 0)`
      el.style.opacity = l.o.toFixed(3)
    }
    for (const [key, el] of this.labelEls) if (!seen.has(key)) el.style.opacity = '0'
    const c = frame.constellation
    if (c.pts.length > 1 && c.o > 0.01) {
      this.constellation.setAttribute('points', c.pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '))
      this.constellation.style.opacity = (c.o * 0.85).toFixed(3)
    } else {
      this.constellation.style.opacity = '0'
    }
  }

  private drawStatus(p: number) {
    const ch = chapterAt(p)
    if (ch.id !== this.lastChapter) {
      this.lastChapter = ch.id
      const n = String(CHAPTERS.indexOf(ch)).padStart(2, '0')
      if (this.statusChapter) this.statusChapter.textContent = `${n} / ${ch.label}`
      const navKey = ch.id === 'surface' ? '' : ch.id
      for (const a of this.navLinks) {
        if (a.dataset.jump === navKey) a.setAttribute('aria-current', 'location')
        else a.removeAttribute('aria-current')
      }
    }
    const pct = Math.round(p * 100)
    if (pct !== this.lastPct && this.statusPct) {
      this.lastPct = pct
      this.statusPct.textContent = `${String(pct).padStart(3, '0')}%`
    }
  }

  /** Clears inline styles when falling back to the static page. */
  reset() {
    for (const w of this.wins) {
      w.el.style.opacity = ''
      w.el.classList.remove('is-live')
    }
  }
}
