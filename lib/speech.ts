"use strict"
import { normHz, lev } from './state'

/* ---------- Web Speech API (browser ASR) ---------- */
export const srSupported = () =>
  typeof window !== 'undefined' && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition)

export interface ListenHandle { stop: () => void }

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
