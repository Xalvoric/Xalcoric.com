import type { Sound } from './audio'
import { CONTACT_EMAIL, JUMPS, WINDOWS } from './config'
import type { ScrollDriver } from './scroll'
import { storageSet } from './util'

type Opts = {
  gl: boolean
  sound: Sound
  reduced: boolean
  scroll?: ScrollDriver
  /** Current opacity of an overlay window (GL mode). */
  opacityOf?: (key: string) => number
  onFaq?: (index: number) => void
  onTheme?: (dark: boolean) => void
}

const $ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T | null
const $$ = <T extends Element = HTMLElement>(sel: string, root: ParentNode = document) => [...root.querySelectorAll<T>(sel)]

export function initUI(opts: Opts) {
  const { gl, sound, scroll } = opts
  const root = document.documentElement

  // ---------- dialogs ----------
  const formHome = $('[data-form-home]')!
  const form = $<HTMLFormElement>('[data-contact-form]')!
  const formSlot = $('[data-form-slot]')!

  function openDialog(id: string) {
    const dlg = document.getElementById(id) as HTMLDialogElement | null
    if (!dlg || dlg.open) return
    if (id === 'dlg-contact') {
      if (!gl) {
        document.getElementById('contact')?.scrollIntoView({ behavior: opts.reduced ? 'auto' : 'smooth' })
        $<HTMLInputElement>('#f-name')?.focus({ preventScroll: true })
        return
      }
      formSlot.appendChild(form)
    }
    for (const d of $$<HTMLDialogElement>('dialog[open]')) d.close()
    dlg.showModal()
    root.classList.add('dialog-open')
    sound.blip('open')
  }

  for (const dlg of $$<HTMLDialogElement>('dialog')) {
    dlg.addEventListener('close', () => {
      if (!$('dialog[open]')) root.classList.remove('dialog-open')
      if (dlg.id === 'dlg-contact') formHome.appendChild(form)
      sound.blip('close')
    })
    dlg.addEventListener('click', (e) => {
      if (e.target === dlg) dlg.close()
    })
    for (const btn of $$('[data-close]', dlg)) btn.addEventListener('click', () => dlg.close())
  }
  for (const btn of $$('[data-open]')) btn.addEventListener('click', () => openDialog(btn.dataset.open!))

  // ---------- services: explore opens the full description ----------
  const serviceSlot = $('[data-service-slot]')!
  function openService(index: number) {
    const src = $(`[data-service="${index}"]`)
    if (!src) return
    const clone = src.cloneNode(true) as HTMLElement
    clone.removeAttribute('data-window')
    clone.removeAttribute('style')
    clone.removeAttribute('id')
    clone.classList.add('service--full')
    clone.querySelector('[data-explore]')?.remove()
    const title = clone.querySelector('h3')
    if (title) title.id = 'dlg-service-title'
    clone.setAttribute('aria-labelledby', 'dlg-service-title')
    const cta = document.createElement('button')
    cta.type = 'button'
    cta.className = 'btn'
    cta.textContent = 'Start a project'
    cta.addEventListener('click', () => openDialog('dlg-contact'))
    clone.appendChild(cta)
    serviceSlot.replaceChildren(clone)
    openDialog('dlg-service')
  }
  for (const btn of $$('[data-explore]')) btn.addEventListener('click', () => openService(Number(btn.dataset.explore)))

  // ---------- navigation ----------
  for (const a of $$<HTMLAnchorElement>('[data-jump]')) {
    a.addEventListener('click', (e) => {
      const key = a.dataset.jump!
      const menu = document.getElementById('dlg-menu') as HTMLDialogElement
      if (menu.open) menu.close()
      if (!gl || !scroll) return
      e.preventDefault()
      scroll.jumpTo(JUMPS[key] ?? 0, opts.reduced)
    })
  }
  const brand = $<HTMLAnchorElement>('.brand')
  brand?.addEventListener('click', (e) => {
    if (!gl || !scroll) return
    e.preventDefault()
    scroll.jumpTo(0, opts.reduced)
  })

  // Keyboard focus moving into an overlay that is not on screen brings its beat into view.
  if (gl && scroll && opts.opacityOf) {
    document.addEventListener('focusin', (e) => {
      const host = (e.target as HTMLElement).closest<HTMLElement>('[data-window]')
      if (!host || root.classList.contains('dialog-open')) return
      const key = host.dataset.window!
      if (opts.opacityOf!(key) > 0.5) return
      const w = WINDOWS[key]
      if (w) scroll.jumpTo(Math.max(0, (w[1] + w[2]) / 2), opts.reduced)
    })
  }

  // ---------- FAQ carousel (GL mode) ----------
  const items = $$('.qa')
  const carousel = $('[data-carousel]')
  let faqIndex = 0
  function setFaq(i: number, announce = true) {
    faqIndex = (i + items.length) % items.length
    items.forEach((el, k) => el.classList.toggle('is-active', k === faqIndex))
    const label = (k: number) => items[(k + items.length) % items.length].dataset.short ?? ''
    $('[data-carousel-side="prev"]')!.textContent = label(faqIndex - 1)
    $('[data-carousel-side="active"]')!.textContent = `[ ${label(faqIndex)} ]`
    $('[data-carousel-side="next"]')!.textContent = label(faqIndex + 1)
    if (announce) {
      const live = $('[data-carousel-live]')!
      live.textContent = `Question ${faqIndex + 1} of ${items.length}: ${items[faqIndex].querySelector('h3')?.textContent ?? ''}`
      sound.blip('tick')
    }
    opts.onFaq?.(faqIndex)
  }
  if (gl && carousel) {
    carousel.hidden = false
    setFaq(0, false)
    $('[data-carousel-prev]')!.addEventListener('click', () => setFaq(faqIndex - 1))
    $('[data-carousel-next]')!.addEventListener('click', () => setFaq(faqIndex + 1))
    document.addEventListener('keydown', (e) => {
      if (root.classList.contains('dialog-open') || (opts.opacityOf?.('faq') ?? 0) < 0.5) return
      if ((e.target as HTMLElement).closest('input, textarea, select')) return
      if (e.key === 'ArrowLeft') setFaq(faqIndex - 1)
      if (e.key === 'ArrowRight') setFaq(faqIndex + 1)
    })
  }

  // ---------- sound ----------
  const soundBtn = $<HTMLButtonElement>('[data-sound]')!
  const soundLabel = $('[data-sound-label]')!
  soundBtn.addEventListener('click', async () => {
    const on = await sound.toggle()
    soundBtn.setAttribute('aria-pressed', String(on))
    soundLabel.textContent = on ? 'On' : 'Off'
  })
  for (const el of $$('a, button')) el.addEventListener('pointerenter', () => sound.blip('tick'))

  // ---------- theme ----------
  const themeBtn = $<HTMLButtonElement>('[data-theme-toggle]')!
  const themeLabel = $('[data-theme-label]')!
  const themeMeta = $<HTMLMetaElement>('meta[name="theme-color"]')
  function applyTheme(dark: boolean) {
    root.dataset.theme = dark ? 'dark' : 'light'
    themeBtn.setAttribute('aria-pressed', String(dark))
    themeLabel.textContent = dark ? 'Dark' : 'Bright'
    themeMeta?.setAttribute('content', dark ? '#0f1115' : '#9da3ae')
    opts.onTheme?.(dark)
  }
  applyTheme(root.dataset.theme === 'dark')
  themeBtn.addEventListener('click', () => {
    const dark = root.dataset.theme !== 'dark'
    storageSet('xal-theme', dark ? 'dark' : 'light')
    applyTheme(dark)
    sound.blip('tick')
  })

  // ---------- contact form ----------
  initForm(form)

  return { openService, openDialog }
}

function initForm(form: HTMLFormElement) {
  const status = form.querySelector('[data-form-status]') as HTMLElement
  const fields = ['name', 'email', 'message'] as const
  const messages: Record<(typeof fields)[number], (el: HTMLInputElement | HTMLTextAreaElement) => string> = {
    name: (el) => (el.value.trim() ? '' : 'Please add your name.'),
    email: (el) =>
      !el.value.trim() ? 'Please add an email address.' : (el as HTMLInputElement).validity.typeMismatch ? 'That email address does not look right.' : '',
    message: (el) => (el.value.trim().length >= 10 ? '' : 'Tell us a little more, at least a sentence.'),
  }

  function check(name: (typeof fields)[number]) {
    const el = form.elements.namedItem(name) as HTMLInputElement | HTMLTextAreaElement
    const err = form.querySelector(`#f-${name}-err`) as HTMLElement
    const msg = messages[name](el)
    err.textContent = msg
    el.setAttribute('aria-invalid', msg ? 'true' : 'false')
    if (msg) el.setAttribute('aria-describedby', `f-${name}-err`)
    else el.removeAttribute('aria-describedby')
    return !msg
  }

  for (const name of fields) {
    const el = form.elements.namedItem(name) as HTMLInputElement
    el.addEventListener('blur', () => {
      if (el.value) check(name)
    })
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault()
    const results = fields.map(check)
    if (results.includes(false)) {
      const first = fields[results.indexOf(false)]
      ;(form.elements.namedItem(first) as HTMLElement).focus()
      status.textContent = ''
      return
    }
    const data = new FormData(form)
    if (!CONTACT_EMAIL) {
      status.textContent =
        'Thanks. This form is not connected to an inbox yet, so nothing was sent. Your details are still in the form.'
      return
    }
    const body = [
      `Name: ${data.get('name')}`,
      `Email: ${data.get('email')}`,
      `Company: ${data.get('company') || '-'}`,
      `Service: ${data.get('service')}`,
      '',
      String(data.get('message')),
    ].join('\n')
    const subject = `Project enquiry: ${data.get('service')}`
    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    status.textContent = 'Your email app should open with the enquiry ready to send.'
  })
}
