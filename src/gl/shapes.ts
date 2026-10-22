import { mulberry32 } from '../util'

// Point clouds for the particle form in the room. Each shape is an abstract
// figure tied to one FAQ answer, plus the studio mark for contact. All fit
// roughly x,z in [-1.5, 1.5] and y in [0, 3.2]. Points are sorted by height so
// particle k lands at a similar height in every shape, which keeps morphs calm.

type P3 = [number, number, number]
type Part = { w: number; f: (r: () => number) => P3 }

function boxSurface(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, w = 1): Part {
  const ax = sy * sz
  const ay = sx * sz
  const az = sx * sy
  const tot = ax + ay + az
  return {
    w: w * tot,
    f: (r) => {
      const t = r() * tot
      const s = r() < 0.5 ? -0.5 : 0.5
      let x = (r() - 0.5) * sx
      let y = (r() - 0.5) * sy
      let z = (r() - 0.5) * sz
      if (t < ax) x = s * sx
      else if (t < ax + ay) y = s * sy
      else z = s * sz
      return [cx + x, cy + y, cz + z]
    },
  }
}

function sample(parts: Part[], n: number, seed: number) {
  const r = mulberry32(seed)
  const total = parts.reduce((a, p) => a + p.w, 0)
  const pts: P3[] = []
  for (let i = 0; i < n; i++) {
    let t = r() * total
    let part = parts[0]
    for (const p of parts) {
      if (t < p.w) {
        part = p
        break
      }
      t -= p.w
    }
    pts.push(part.f(r))
  }
  pts.sort((a, b) => a[1] - b[1])
  const out = new Float32Array(n * 3)
  pts.forEach((p, i) => out.set(p, i * 3))
  return out
}

/** One service: a single browser window, header bar and content blocks. */
function windowShape(n: number) {
  return sample(
    [
      boxSurface(0, 1.6, 0, 2.8, 2.1, 0.22, 1),
      boxSurface(0, 2.5, 0.16, 2.8, 0.26, 0.1, 1.4),
      boxSurface(-0.65, 1.55, 0.18, 1.2, 1.1, 0.12, 1.4),
      boxSurface(0.75, 1.8, 0.18, 0.95, 0.42, 0.12, 1.4),
      boxSurface(0.75, 1.15, 0.18, 0.95, 0.42, 0.12, 1.4),
    ],
    n,
    11,
  )
}

/** AI in practice: a sphere of nodes with connections running through it. */
function neuralShape(n: number) {
  const r0 = mulberry32(5)
  const nodes: P3[] = []
  for (let i = 0; i < 26; i++) {
    const u = r0() * 2 - 1
    const a = r0() * Math.PI * 2
    const s = Math.sqrt(1 - u * u)
    const rad = 0.5 + r0() * 0.85
    nodes.push([Math.cos(a) * s * rad, 1.6 + u * rad, Math.sin(a) * s * rad])
  }
  return sample(
    [
      {
        w: 0.55,
        f: (r) => {
          const u = r() * 2 - 1
          const a = r() * Math.PI * 2
          const s = Math.sqrt(1 - u * u)
          const rad = 1.45 + (r() - 0.5) * 0.06
          return [Math.cos(a) * s * rad, 1.6 + u * rad, Math.sin(a) * s * rad]
        },
      },
      {
        w: 0.2,
        f: (r) => {
          const c = nodes[Math.floor(r() * nodes.length)]
          const d = 0.09
          return [c[0] + (r() - 0.5) * d, c[1] + (r() - 0.5) * d, c[2] + (r() - 0.5) * d]
        },
      },
      {
        w: 0.25,
        f: (r) => {
          const i = Math.floor(r() * nodes.length)
          const a = nodes[i]
          const b = nodes[(i * 7 + 3) % nodes.length]
          const t = r()
          return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
        },
      },
    ],
    n,
    12,
  )
}

/** Product photos: a play prism inside a square frame, for ad creative. */
function prismShape(n: number) {
  const tri: [number, number][] = [
    [-0.75, 0.7],
    [-0.75, 2.5],
    [0.95, 1.6],
  ]
  const inTri = (r: () => number): [number, number] => {
    let a = r()
    let b = r()
    if (a + b > 1) {
      a = 1 - a
      b = 1 - b
    }
    return [
      tri[0][0] + (tri[1][0] - tri[0][0]) * a + (tri[2][0] - tri[0][0]) * b,
      tri[0][1] + (tri[1][1] - tri[0][1]) * a + (tri[2][1] - tri[0][1]) * b,
    ]
  }
  const edge = (r: () => number): [number, number] => {
    const i = Math.floor(r() * 3)
    const a = tri[i]
    const b = tri[(i + 1) % 3]
    const t = r()
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  }
  return sample(
    [
      { w: 0.4, f: (r) => { const [x, y] = inTri(r); return [x, y, (r() < 0.5 ? -1 : 1) * 0.35] } },
      { w: 0.25, f: (r) => { const [x, y] = edge(r); return [x, y, (r() - 0.5) * 0.7] } },
      boxSurface(0, 1.6, 0, 3.0, 3.0, 0.06, 0.12),
    ],
    n,
    13,
  )
}

/** Pricing: a short stack of offset discs, quoted one project at a time. */
function discShape(n: number) {
  const discs = Array.from({ length: 6 }, (_, i) => ({ y: 0.45 + i * 0.44, x: Math.sin(i * 1.7) * 0.18, z: Math.cos(i * 1.3) * 0.18 }))
  return sample(
    discs.map((d) => ({
      w: 1,
      f: (r: () => number): P3 => {
        const a = r() * Math.PI * 2
        const top = r()
        if (top < 0.6) {
          const rad = Math.sqrt(r()) * 1.15
          return [d.x + Math.cos(a) * rad, d.y + (r() < 0.5 ? 0.15 : -0.15), d.z + Math.sin(a) * rad]
        }
        return [d.x + Math.cos(a) * 1.15, d.y + (r() - 0.5) * 0.3, d.z + Math.sin(a) * 1.15]
      },
    })),
    n,
    14,
  )
}

/** Existing website: three stacked page layers, before and after. */
function layersShape(n: number) {
  return sample(
    [0, 1, 2].map((i) => boxSurface(-0.45 + i * 0.45, 1.1 + i * 0.5, -0.45 + i * 0.45, 2.1, 1.4, 0.08, 1)),
    n,
    15,
  )
}

/** Your data: a lattice of small cubes with a few held back. */
function latticeShape(n: number) {
  const cells: Part[] = []
  const r0 = mulberry32(8)
  for (let x = 0; x < 4; x++)
    for (let y = 0; y < 4; y++)
      for (let z = 0; z < 4; z++) {
        if (r0() < 0.22) continue
        cells.push(boxSurface(-1.05 + x * 0.7, 0.55 + y * 0.7, -1.05 + z * 0.7, 0.42, 0.42, 0.42, 1))
      }
  return sample(cells, n, 16)
}

/** Contact: the Xalvoric mark, extruded. Outline taken from the brand favicon path. */
function markShape(n: number) {
  const raw: [number, number][] = [
    [3, 2], [7.6, 2], [12, 9.2], [16.4, 2], [21, 2], [14.4, 12],
    [21, 22], [16.4, 22], [12, 14.8], [7.6, 22], [3, 22], [9.6, 12],
  ]
  const poly = raw.map(([x, y]) => [((x - 12) / 10) * 1.55, ((22 - y) / 20) * 3.0 + 0.15] as [number, number])
  const inside = (x: number, y: number) => {
    let c = false
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]
      const [xj, yj] = poly[j]
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
    }
    return c
  }
  const lens = poly.map((p, i) => Math.hypot(poly[(i + 1) % poly.length][0] - p[0], poly[(i + 1) % poly.length][1] - p[1]))
  const per = lens.reduce((a, b) => a + b, 0)
  return sample(
    [
      {
        w: 0.6,
        f: (r) => {
          for (;;) {
            const x = -1.6 + r() * 3.2
            const y = 0.1 + r() * 3.1
            if (inside(x, y)) return [x, y, (r() < 0.5 ? -1 : 1) * 0.28]
          }
        },
      },
      {
        w: 0.4,
        f: (r) => {
          let t = r() * per
          let i = 0
          while (t > lens[i]) t -= lens[i++]
          const a = poly[i]
          const b = poly[(i + 1) % poly.length]
          const u = t / lens[i]
          return [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, (r() - 0.5) * 0.56]
        },
      },
    ],
    n,
    17,
  )
}

export function buildShapes(n: number) {
  return [windowShape(n), neuralShape(n), prismShape(n), discShape(n), layersShape(n), latticeShape(n), markShape(n)]
}

export const MARK_SHAPE = 6
