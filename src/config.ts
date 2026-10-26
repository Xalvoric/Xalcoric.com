// One place for the scroll timeline. Every number is scroll progress `p`:
// 0 at the top of the page, 1 at the bottom. The WebGL scene and the HTML
// overlays both read these, so tuning a beat here moves both together.

/**
 * Where the contact form sends enquiries. Leave empty until there is a real
 * inbox: the form then says plainly that it is not connected. When set, the
 * form opens the visitor's email app with a pre-filled draft (mailto:).
 */
export const CONTACT_EMAIL = ''

/** Total scroll length of the experience, in viewport heights. */
export const SCROLL_VH = 1550

export const T = {
  /** Surface: monolith hero, then the blocks lift away and the camera climbs into cloud. */
  heroEnd: 0.08,
  surfaceEnd: 0.15,
  /** Services: four shards in the fog. Camera holds on each at these points. */
  shards: [0.25, 0.32, 0.39, 0.46],
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
  'service-0': [0.22, 0.233, 0.267, 0.28],
  'service-1': [0.29, 0.303, 0.337, 0.35],
  'service-2': [0.36, 0.373, 0.407, 0.42],
  'service-3': [0.43, 0.443, 0.477, 0.49],
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
