import { mulberry32 } from '../util'

// 2D simplex noise (after Stefan Gustavson's public-domain reference), seeded.
const F2 = 0.5 * (Math.sqrt(3) - 1)
const G2 = (3 - Math.sqrt(3)) / 6
const GRAD = [
  [1, 1], [-1, 1], [1, -1], [-1, -1],
  [1, 0], [-1, 0], [0, 1], [0, -1],
]

export type Noise2D = (x: number, y: number) => number

export function createNoise2D(seed = 1): Noise2D {
  const rand = mulberry32(seed)
  const p = new Uint8Array(256)
  for (let i = 0; i < 256; i++) p[i] = i
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    const t = p[i]
    p[i] = p[j]
    p[j] = t
  }
  const perm = new Uint8Array(512)
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255]

  return (x, y) => {
    const s = (x + y) * F2
    const i = Math.floor(x + s)
    const j = Math.floor(y + s)
    const t = (i + j) * G2
    const x0 = x - (i - t)
    const y0 = y - (j - t)
    const i1 = x0 > y0 ? 1 : 0
    const j1 = 1 - i1
    const x1 = x0 - i1 + G2
    const y1 = y0 - j1 + G2
    const x2 = x0 - 1 + 2 * G2
    const y2 = y0 - 1 + 2 * G2
    const ii = i & 255
    const jj = j & 255
    let n = 0
    let t0 = 0.5 - x0 * x0 - y0 * y0
    if (t0 > 0) {
      const g = GRAD[perm[ii + perm[jj]] & 7]
      t0 *= t0
      n += t0 * t0 * (g[0] * x0 + g[1] * y0)
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1
    if (t1 > 0) {
      const g = GRAD[perm[ii + i1 + perm[jj + j1]] & 7]
      t1 *= t1
      n += t1 * t1 * (g[0] * x1 + g[1] * y1)
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2
    if (t2 > 0) {
      const g = GRAD[perm[ii + 1 + perm[jj + 1]] & 7]
      t2 *= t2
      n += t2 * t2 * (g[0] * x2 + g[1] * y2)
    }
    return 70 * n
  }
}

export function fbm2(noise: Noise2D, x: number, y: number, octaves = 5, lacunarity = 2.03, gain = 0.5) {
  let sum = 0
  let amp = 0.5
  let freq = 1
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise(x * freq, y * freq)
    freq *= lacunarity
    amp *= gain
  }
  return sum
}

/** Cheap 3D noise built from two 2D fields; good enough for displacing rock geometry. */
export function createNoise3D(seed = 1) {
  const a = createNoise2D(seed)
  const b = createNoise2D(seed + 101)
  const c = createNoise2D(seed + 211)
  return (x: number, y: number, z: number) => (a(x, y) + b(y, z) + c(z, x)) / 3
}
