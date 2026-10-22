import { WHITEOUTS } from './config'

export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const invLerp = (a: number, b: number, v: number) => clamp((v - a) / (b - a))

export function smoothstep(a: number, b: number, v: number) {
  const t = invLerp(a, b, v)
  return t * t * (3 - 2 * t)
}

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2)
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
export const easeInCubic = (t: number) => t * t * t

/** Frame-rate independent exponential smoothing. */
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt))

/** Opacity for a [fadeInStart, fadeInEnd, fadeOutStart, fadeOutEnd] window. */
export function windowOpacity(w: readonly [number, number, number, number], p: number) {
  return Math.min(smoothstep(w[0], w[1], p), 1 - smoothstep(w[2], w[3], p))
}

/** How much the scene is washed to fog at progress p (0..1). */
export function whiteoutAt(p: number) {
  let w = 0
  for (const [a, peak, b] of WHITEOUTS) {
    if (p < a || p > b) continue
    w = Math.max(w, p <= peak ? smoothstep(a, peak, p) : 1 - smoothstep(peak, b, p))
  }
  return w
}

/** Seeded PRNG so procedural layouts are identical on every visit. */
export function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()))

export function storageGet(key: string) {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* private mode or blocked storage: the preference just isn't remembered */
  }
}
