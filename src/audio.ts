import { storageGet, storageSet } from './util'

// All sound is synthesised with Web Audio: wind from filtered noise, a low
// drone above the clouds, and short tones for interface feedback. No files.
// Off by default; the choice is remembered on this device.

type Mood = 'surface' | 'void' | 'room'

export class Sound {
  enabled = false
  private ctx: AudioContext | null = null
  private master!: GainNode
  private windGain!: GainNode
  private windFilter!: BiquadFilterNode
  private droneGain!: GainNode
  private noise!: AudioBuffer
  private mood: Mood = 'surface'
  private lastTick = 0

  get remembered() {
    return storageGet('xal-sound') === 'on'
  }

  async toggle() {
    if (this.enabled) this.disable()
    else await this.enable()
    storageSet('xal-sound', this.enabled ? 'on' : 'off')
    return this.enabled
  }

  private async enable() {
    if (!this.ctx) this.setup()
    const ctx = this.ctx!
    await ctx.resume()
    this.enabled = true
    this.master.gain.cancelScheduledValues(ctx.currentTime)
    this.master.gain.setTargetAtTime(0.75, ctx.currentTime, 0.4)
    this.setMood(this.mood)
    this.blip('open')
  }

  private disable() {
    const ctx = this.ctx
    this.enabled = false
    if (!ctx) return
    this.master.gain.setTargetAtTime(0, ctx.currentTime, 0.15)
    window.setTimeout(() => {
      if (!this.enabled) void ctx.suspend()
    }, 600)
  }

  private setup() {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AC()
    this.ctx = ctx
    this.master = ctx.createGain()
    this.master.gain.value = 0
    this.master.connect(ctx.destination)

    // Brown-ish noise buffer shared by wind and whooshes.
    const len = ctx.sampleRate * 3
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = this.noise.getChannelData(0)
    let last = 0
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02
      d[i] = last * 3.5
    }

    const src = ctx.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    this.windFilter = ctx.createBiquadFilter()
    this.windFilter.type = 'bandpass'
    this.windFilter.frequency.value = 420
    this.windFilter.Q.value = 0.7
    const lfo = ctx.createOscillator()
    lfo.frequency.value = 0.06
    const lfoGain = ctx.createGain()
    lfoGain.gain.value = 260
    lfo.connect(lfoGain).connect(this.windFilter.frequency)
    this.windGain = ctx.createGain()
    this.windGain.gain.value = 0
    src.connect(this.windFilter).connect(this.windGain).connect(this.master)
    src.start()
    lfo.start()

    this.droneGain = ctx.createGain()
    this.droneGain.gain.value = 0
    const lp = ctx.createBiquadFilter()
    lp.type = 'lowpass'
    lp.frequency.value = 520
    lp.connect(this.droneGain).connect(this.master)
    for (const [f, type, g] of [
      [55, 'sine', 0.5],
      [82.6, 'sine', 0.35],
      [110.4, 'triangle', 0.15],
    ] as const) {
      const o = ctx.createOscillator()
      o.type = type
      o.frequency.value = f
      const og = ctx.createGain()
      og.gain.value = g
      o.connect(og).connect(lp)
      o.start()
    }
  }

  setMood(mood: Mood) {
    this.mood = mood
    const ctx = this.ctx
    if (!ctx || !this.enabled) return
    const t = ctx.currentTime
    this.windGain.gain.setTargetAtTime(mood === 'surface' ? 0.42 : 0.12, t, 1.2)
    this.droneGain.gain.setTargetAtTime(mood === 'surface' ? 0.0 : mood === 'void' ? 0.09 : 0.06, t, 1.5)
  }

  blip(kind: 'tick' | 'open' | 'close' | 'morph' | 'whoosh') {
    const ctx = this.ctx
    if (!ctx || !this.enabled) return
    const t = ctx.currentTime
    if (kind === 'tick') {
      if (t - this.lastTick < 0.06) return
      this.lastTick = t
    }
    if (kind === 'morph' || kind === 'whoosh') {
      const src = ctx.createBufferSource()
      src.buffer = this.noise
      const f = ctx.createBiquadFilter()
      f.type = 'bandpass'
      f.Q.value = 1.4
      f.frequency.setValueAtTime(kind === 'morph' ? 300 : 900, t)
      f.frequency.exponentialRampToValueAtTime(kind === 'morph' ? 2200 : 180, t + 0.9)
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.35, t + 0.25)
      g.gain.exponentialRampToValueAtTime(0.001, t + 1.1)
      src.connect(f).connect(g).connect(this.master)
      src.start(t, Math.random() * 2)
      src.stop(t + 1.2)
      return
    }
    const notes = kind === 'tick' ? [1760] : kind === 'open' ? [660, 990] : [880, 587]
    notes.forEach((freq, i) => {
      const o = ctx.createOscillator()
      o.type = 'sine'
      o.frequency.value = freq
      const g = ctx.createGain()
      const s = t + i * 0.07
      const peak = kind === 'tick' ? 0.03 : 0.06
      g.gain.setValueAtTime(0, s)
      g.gain.linearRampToValueAtTime(peak, s + 0.006)
      g.gain.exponentialRampToValueAtTime(0.0001, s + (kind === 'tick' ? 0.05 : 0.18))
      o.connect(g).connect(this.master)
      o.start(s)
      o.stop(s + 0.25)
    })
  }
}
