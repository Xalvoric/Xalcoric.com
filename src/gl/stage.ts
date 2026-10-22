import * as THREE from 'three'
import type { CamSample } from './keys'

/** Screen-space data the HTML overlay draws each frame (leader lines, block numbers). */
export type HudFrame = {
  /** Points the overlay connects its boxes to, keyed like `data-window`. */
  anchors: Record<string, { x: number; y: number; on: boolean }>
  /** Small floating labels, e.g. the numbers on monolith blocks. */
  labels: { key: string; x: number; y: number; text: string; o: number }[]
  /** Polyline joining the labels, igloo-style constellation. */
  constellation: { pts: [number, number][]; o: number }
}

export type FrameCtx = {
  p: number
  time: number
  dt: number
  /** Intro sequence progress (0..1), time-based, before scroll unlocks. */
  intro: number
  /** Smoothed pointer, -1..1 on both axes; zero for touch. */
  pointer: THREE.Vector2
  portrait: boolean
  cam: CamSample
  camera: THREE.PerspectiveCamera
  width: number
  height: number
  hud: HudFrame
}

export type StageAction = { type: 'service'; index: number }

export interface Stage {
  group: THREE.Group
  fogColor: THREE.Color
  fogDensity: number
  skyTop: THREE.Color
  skyBottom: THREE.Color
  /** Fills ctx.cam and animates the stage for this frame. */
  update(ctx: FrameCtx): void
  /** Projects overlay anchors once the camera is final for this frame. */
  project(ctx: FrameCtx): void
  /** Returns true when the pointer is over something clickable. */
  pick?(raycaster: THREE.Raycaster): boolean
  click?(): StageAction | null
}

const v = new THREE.Vector3()

export function toScreen(p: THREE.Vector3, ctx: FrameCtx, out: { x: number; y: number; on: boolean }) {
  v.copy(p).project(ctx.camera)
  out.x = (v.x * 0.5 + 0.5) * ctx.width
  out.y = (-v.y * 0.5 + 0.5) * ctx.height
  out.on = v.z > -1 && v.z < 1 && v.x > -0.98 && v.x < 0.98 && v.y > -0.98 && v.y < 0.98
  return out
}

export function anchor(hud: HudFrame, key: string) {
  return (hud.anchors[key] ??= { x: 0, y: 0, on: false })
}
