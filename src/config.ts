// One place for the scroll timeline. Every number is scroll progress `p`:
// 0 at the top of the page, 1 at the bottom. The WebGL scene and the HTML
// overlays both read these, so tuning a beat here moves both together.

/**
 * Where the contact form sends enquiries. Leave empty until there is a real
 * inbox: the form then says plainly that it is not connected. When set, the
 * form opens the visitor's email app with a pre-filled draft (mailto:).
 */
export const CONTACT_EMAIL = ''

/**
 * Scroll pacing. The timeline below is in progress units `p`; PACE stretches
 * parts of it on the page so a stretch gets more scroll distance without
 * retiming everything after it. Each crystal keeps the same screen time.
 */
const BASE_VH = 1550
const PACE: { to: number; stretch: number }[] = [
  { to: 0.214, stretch: 1 },
  { to: 0.49, stretch: 1.25 },
  { to: 1, stretch: 1 },
]
const SEG_VH = PACE.map((s, i) => (s.to - (i ? PACE[i - 1].to : 0)) * BASE_VH * s.stretch)

/** Total scroll length of the experience, in viewport heights. */
export const SCROLL_VH = SEG_VH.reduce((a, b) => a + b, 0)

/** Page scroll fraction (0..1) to timeline progress. */
export function toTimeline(u: number) {
  let vh = u * SCROLL_VH
  let from = 0
  for (let i = 0; i < PACE.length; i++) {
    if (vh <= SEG_VH[i] || i === PACE.length - 1) return Math.min(1, from + (vh / SEG_VH[i]) * (PACE[i].to - from))
    vh -= SEG_VH[i]
    from = PACE[i].to
  }
  return 1
}

/** Timeline progress to page scroll fraction (inverse of toTimeline). */
export function toScroll(p: number) {
  let vh = 0
  let from = 0
  for (let i = 0; i < PACE.length; i++) {
    const span = PACE[i].to - from
    if (p <= PACE[i].to || i === PACE.length - 1) return (vh + (Math.max(0, p - from) / span) * SEG_VH[i]) / SCROLL_VH
    vh += SEG_VH[i]
    from = PACE[i].to
  }
  return 1
}

export const T = {
  /** Surface: monolith hero, then the blocks lift away and the camera climbs into cloud. */
  heroEnd: 0.08,
  surfaceEnd: 0.15,
  /** Services: five shards in the fog. Camera holds on each at these points. */
  shards: [0.24, 0.296, 0.352, 0.408, 0.464],
  /** Process: the camera passes through one ring per step at these points. */
  rings: [0.56, 0.61, 0.66, 0.71],
  /** The light at the end of the rings; the room starts behind it. */
  portalEnd: 0.75,
  /** Room: FAQ carousel, then the particles settle into the mark for contact. */
  faqEnd: 0.9,
}

/** Whiteout bumps that hide the cuts between stages: [rise start, peak, fall end]. */
export const WHITEOUTS: [number, number, number][] = [
  [0.11, T.surfaceEnd, 0.18],
  [0.715, T.portalEnd, 0.78],
]

/**
 * Overlay visibility windows: [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd].
 * Keys match `data-window` attributes in index.html.
 */
export const WINDOWS: Record<string, [number, number, number, number]> = {
  hero: [-1, 0, 0.045, 0.075],
  hint: [-1, 0, 0.015, 0.04],
  'services-intro': [0.165, 0.178, 0.2, 0.213],
  'service-0': [0.216, 0.2265, 0.2535, 0.264],
  'service-1': [0.272, 0.2825, 0.3095, 0.32],
  'service-2': [0.328, 0.3385, 0.3655, 0.376],
  'service-3': [0.384, 0.3945, 0.4215, 0.432],
  'service-4': [0.44, 0.4505, 0.4775, 0.488],
  'process-intro': [0.495, 0.505, 0.518, 0.528],
  'step-0': [0.52, 0.53, 0.548, 0.556],
  'step-1': [0.57, 0.58, 0.598, 0.606],
  'step-2': [0.62, 0.63, 0.648, 0.656],
  'step-3': [0.67, 0.68, 0.698, 0.706],
  faq: [0.775, 0.79, 0.895, 0.91],
  contact: [0.915, 0.93, 2, 2],
}

/** Where nav links land. */
export const JUMPS: Record<string, number> = {
  top: 0,
  services: 0.19,
  process: 0.51,
  faq: 0.815,
  contact: 0.96,
}

export type ChapterId = 'surface' | 'services' | 'process' | 'faq' | 'contact'

export const CHAPTERS: { id: ChapterId; label: string; start: number }[] = [
  { id: 'surface', label: 'Surface', start: 0 },
  { id: 'services', label: 'Services', start: T.surfaceEnd },
  { id: 'process', label: 'Process', start: 0.495 },
  { id: 'faq', label: 'FAQ', start: T.portalEnd },
  { id: 'contact', label: 'Contact', start: T.faqEnd },
]

export function chapterAt(p: number) {
  let current = CHAPTERS[0]
  for (const c of CHAPTERS) if (p >= c.start) current = c
  return current
}
