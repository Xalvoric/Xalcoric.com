import type * as THREE from 'three'
import { easeInOutCubic } from '../util'

export type V3 = [number, number, number]

/** A camera keyframe. `ease: 'lin'` keeps speed through the key instead of settling on it. */
export type CamKey = { t: number; pos: V3; look: V3; roll?: number; ease?: 'io' | 'lin' }

export type CamSample = { pos: THREE.Vector3; look: THREE.Vector3; roll: number }

/** Interpolates camera keyframes at `t`. Keys must be sorted by `t`. */
export function sampleKeys(keys: CamKey[], t: number, out: CamSample) {
  if (t <= keys[0].t) return write(out, keys[0], keys[0], 0)
  const last = keys[keys.length - 1]
  if (t >= last.t) return write(out, last, last, 0)
  let i = 0
  while (i < keys.length - 2 && t > keys[i + 1].t) i++
  const a = keys[i]
  const b = keys[i + 1]
  const u = (t - a.t) / (b.t - a.t)
  return write(out, a, b, b.ease === 'lin' ? u : easeInOutCubic(u))
}

function write(out: CamSample, a: CamKey, b: CamKey, e: number) {
  out.pos.set(
    a.pos[0] + (b.pos[0] - a.pos[0]) * e,
    a.pos[1] + (b.pos[1] - a.pos[1]) * e,
    a.pos[2] + (b.pos[2] - a.pos[2]) * e,
  )
  out.look.set(
    a.look[0] + (b.look[0] - a.look[0]) * e,
    a.look[1] + (b.look[1] - a.look[1]) * e,
    a.look[2] + (b.look[2] - a.look[2]) * e,
  )
  out.roll = (a.roll ?? 0) + ((b.roll ?? 0) - (a.roll ?? 0)) * e
  return out
}

/** Pulls the camera back along its view line, for tall phone screens. */
export function pullBack(out: CamSample, factor: number, lift = 0) {
  out.pos.sub(out.look).multiplyScalar(factor).add(out.look)
  out.look.y += lift
  return out
}
