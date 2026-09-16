"use strict"
import { normHz, lev, diag } from './state'

/* ---------- Web Speech API (browser ASR) ---------- */
export const srSupported = () =>
  typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

export interface ListenHandle { stop: () => void }
export interface MeterHandle { stop: () => void }

/* live mic level meter so the user can see the mic is detected and working */
export async function micMeter(cb: (lvl: number) => void): Promise<MeterHandle | null> {
  try {
    const st = await navigator.mediaDevices.getUserMedia({ audio: true })
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    const ctx = new AC()
    if (ctx.state === 'suspended') { try { await ctx.resume() } catch (e) {} } // autoplay policy — must resume after gesture
    const src = ctx.createMediaStreamSource(st)
    const an = ctx.createAnalyser(); an.fftSize = 512
    src.connect(an)
    const buf = new Uint8Array(an.frequencyBinCount)
    let live = true
    const tick = () => { if (!live) return
      an.getByteFrequencyData(buf)
      let sum = 0; for (const v of buf) sum += v
      cb(Math.min(1, (sum / buf.length) / 60))
      setTimeout(() => requestAnimationFrame(tick), 60) }
    tick()
    return { stop: () => { live = false
      try { st.getTracks().forEach(t => t.stop()) } catch (e) {}
      try { ctx.close() } catch (e) {} } }
  } catch (e: any) { diag('mic meter failed: ' + (e?.message || e)); return null }
}

export function listenZh(
  onPartial: (t: string) => void,
  onFinal: (t: string) => void,
  onErr: (e: string) => void,
): ListenHandle | null {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SR) { onErr('speech recognition unsupported here — use Chrome or Edge, or switch to Silent mode'); return null }
  const r = new SR()
  r.lang = 'zh-CN'; r.interimResults = true; r.maxAlternatives = 3; r.continuous = false
  let got = false
  r.onresult = (e: any) => {
    let interim = '', final = ''
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript
      if (e.results[i].isFinal) final += t; else interim += t
    }
    if (interim) onPartial(interim)
    if (final) { got = true; onFinal(final.trim()) }
  }
  r.onerror = (e: any) => {
    if (got) return
    const map: Record<string, string> = {
      'not-allowed': 'mic blocked — allow microphone access in the browser',
      'service-not-allowed': 'mic blocked by the browser/OS settings',
      'no-speech': 'didn\'t catch anything — try again',
      'network': 'speech service unreachable — check connection',
      'audio-capture': 'no microphone found',
    }
    onErr(map[e.error] || ('mic error: ' + e.error))
  }
  r.onend = () => { if (!got) onErr('didn\'t catch anything — try again') }
  try { r.start() } catch (e: any) { onErr('mic start failed: ' + (e.message || e)); return null }
  return { stop: () => { try { r.stop() } catch (err) {} } }
}

/* ---------- English voice commands (armed while the mic is idle) ---------- */
export type Cmd = 'pass' | 'suspend' | 'pause' | 'again'
export function parseCommand(t: string): Cmd | null {
  const s = (t || '').toLowerCase().replace(/[.!,?]/g, ' ')
  if (/\b(pass|next please|skip|skip it|show me|show answer|i don't know)\b/.test(s)) return 'pass'
  if (/\b(suspend|park|bury|park it|bury it|suspend it)\b/.test(s)) return 'suspend'
  if (/\b(pause|pause it|stop|stop it|hold on|wait)\b/.test(s)) return 'pause'
  if (/\b(again|repeat|repeat it|repeat please|once more|replay)\b/.test(s)) return 'again'
  return null
}
export function listenCmd(onFinal: (c: Cmd) => void, onErr: () => void): ListenHandle | null {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
  if (!SR) return null
  const r = new SR()
  r.lang = 'en-US'; r.interimResults = false; r.maxAlternatives = 1; r.continuous = false
  let got = false
  r.onresult = (e: any) => { for (let i = e.resultIndex; i < e.results.length; i++) {
    if (e.results[i].isFinal) { got = true; const c = parseCommand(e.results[i][0].transcript); if (c) { r.stop(); onFinal(c) } } } }
  r.onerror = () => { if (!got) onErr() }
  r.onend = () => { if (!got) onErr() }
  try { r.start() } catch (e) { return null }
  return { stop: () => { try { r.stop() } catch (err) {} } }
}

/* ---------- accuracy: compare Mandarin attempt vs target ---------- */
export function similarity(said: string, target: string) {
  const a = normHz(said), b = normHz(target)
  if (!a || !b) return 0
  if (a === b) return 1
  if (a.includes(b) || b.includes(a)) return 0.9
  const d = lev(a, b)
  return Math.max(0, 1 - d / Math.max(a.length, b.length))
}
export const PASS = 0.75
