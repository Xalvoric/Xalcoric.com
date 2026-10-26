import * as THREE from 'three'
import { createNoise2D, fbm2 } from './noise'

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const ctx = c.getContext('2d')
  if (!ctx) throw new Error('2D canvas unavailable')
  return { c, ctx }
}

/** Soft radial falloff, white in the middle. Used for glows, halos and contact shadows. */
export function radialTexture(
  size = 256,
  stops: [number, string][] = [
    [0, 'rgba(255,255,255,1)'],
    [0.35, 'rgba(255,255,255,0.45)'],
    [1, 'rgba(255,255,255,0)'],
  ],
) {
  const { c, ctx } = canvas(size, size)
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  for (const [at, color] of stops) g.addColorStop(at, color)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, size, size)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}

/** A line of monospaced text, optionally blurred, on a transparent background. */
export function textTexture(text: string, opts: { size?: number; blur?: number; weight?: number; font?: string } = {}) {
  const size = opts.size ?? 72
  const blur = opts.blur ?? 0
  const font = `${opts.weight ?? 500} ${size}px ${opts.font ?? '"IBM Plex Mono", ui-monospace, monospace'}`
  const probe = canvas(8, 8).ctx
  probe.font = font
  const pad = Math.ceil(blur * 3 + size * 0.25)
  const w = Math.ceil(probe.measureText(text).width + pad * 2)
  const h = Math.ceil(size * 1.4 + pad * 2)
  const { c, ctx } = canvas(w, h)
  ctx.font = font
  ctx.textBaseline = 'middle'
  ctx.fillStyle = '#fff'
  if (blur > 0) ctx.filter = `blur(${blur}px)`
  ctx.fillText(text, pad, h / 2)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.anisotropy = 4
  return { tex, aspect: w / h }
}

/** Tiling normal map from fbm noise: gives snow and rock surfaces fine detail without image assets. */
export function noiseNormalMap(size = 256, seed = 7, strength = 2.2) {
  const n = createNoise2D(seed)
  const hgt = new Float32Array(size * size)
  // Sample on a torus so the map tiles seamlessly.
  const R = 1.6
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const a = (x / size) * Math.PI * 2
      const b = (y / size) * Math.PI * 2
      const u = Math.cos(a) * R + Math.cos(b) * R * 0.37
      const v = Math.sin(a) * R + Math.sin(b) * R * 0.37
      hgt[y * size + x] = fbm2(n, u * 2.2, v * 2.2, 5) + 0.35 * fbm2(n, u * 9 + 17, v * 9 - 5, 3)
    }
  }
  const data = new Uint8Array(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = hgt[y * size + ((x - 1 + size) % size)]
      const r = hgt[y * size + ((x + 1) % size)]
      const d = hgt[((y - 1 + size) % size) * size + x]
      const u = hgt[((y + 1) % size) * size + x]
      let nx = (l - r) * strength
      let ny = (d - u) * strength
      let nz = 1
      const len = Math.hypot(nx, ny, nz)
      nx /= len
      ny /= len
      nz /= len
      const i = (y * size + x) * 4
      data[i] = (nx * 0.5 + 0.5) * 255
      data[i + 1] = (ny * 0.5 + 0.5) * 255
      data[i + 2] = (nz * 0.5 + 0.5) * 255
      data[i + 3] = 255
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.generateMipmaps = true
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.needsUpdate = true
  return tex
}

/** Glyph key for the research shard: a line icon instead of a font glyph. */
export const RESEARCH_ICON = 'icon:research'

/** Magnifying glass over three ascending bars, stroked at the weight of the font glyphs. */
function drawResearchIcon(ctx: CanvasRenderingContext2D, size: number) {
  const u = size / 256
  ctx.strokeStyle = '#fff'
  ctx.lineWidth = 13 * u
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  for (const [x, h] of [
    [74, 34],
    [104, 58],
    [134, 84],
  ]) {
    ctx.moveTo(x * u, 182 * u)
    ctx.lineTo(x * u, (182 - h) * u)
  }
  ctx.moveTo(58 * u, 196 * u)
  ctx.lineTo(150 * u, 196 * u)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(160 * u, 104 * u, 34 * u, 0, Math.PI * 2)
  ctx.moveTo(184 * u, 128 * u)
  ctx.lineTo(206 * u, 150 * u)
  ctx.stroke()
}

/** A large glyph drawn into a square canvas, engraved onto the service shards. */
export function glyphTexture(glyph: string, size = 256) {
  const { c, ctx } = canvas(size, size)
  ctx.fillStyle = '#fff'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.font = `800 ${Math.round(size * 0.42)}px Unbounded, "IBM Plex Mono", sans-serif`
  if (glyph === RESEARCH_ICON) drawResearchIcon(ctx, size)
  else ctx.fillText(glyph, size / 2, size / 2 + size * 0.02)
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'
  ctx.lineWidth = 2
  ctx.strokeRect(size * 0.08, size * 0.08, size * 0.84, size * 0.84)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  return tex
}
