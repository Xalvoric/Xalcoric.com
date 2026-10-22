// Mono labels type themselves in through a short burst of random glyphs.

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/\\<>[]{}=+*#_-'
const running = new WeakMap<HTMLElement, number>()

export function prepareScramble(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-scramble]').forEach((el) => {
    el.dataset.text ??= (el.textContent ?? '').trim()
  })
}

export function scramble(el: HTMLElement, duration = 700) {
  const text = el.dataset.text ?? (el.textContent ?? '').trim()
  el.dataset.text = text
  cancelAnimationFrame(running.get(el) ?? 0)
  const start = performance.now()
  const len = Math.max(1, text.length)
  const tick = (now: number) => {
    const t = Math.min(1, (now - start) / duration)
    let out = ''
    for (let i = 0; i < text.length; i++) {
      const ch = text[i]
      const at = 0.15 + (i / len) * 0.75
      if (ch === ' ' || t >= at) out += ch
      else if (t >= at - 0.22) out += GLYPHS[(Math.random() * GLYPHS.length) | 0]
    }
    el.textContent = out
    if (t < 1) running.set(el, requestAnimationFrame(tick))
    else el.textContent = text
  }
  running.set(el, requestAnimationFrame(tick))
}

export function scrambleWithin(root: ParentNode) {
  root.querySelectorAll<HTMLElement>('[data-scramble]').forEach((el, i) => {
    window.setTimeout(() => scramble(el), i * 70)
  })
}
