"use strict"
import { S, esc, Note } from './state'
import { getTts, putTts } from './idb'

/* ---------- TTS & audio ---------- */
export function pickVoice() {
  const vs = speechSynthesis.getVoices()
  return vs.find(v => /zh[-_]CN/i.test(v.lang) && /natural|neural/i.test(v.name))
      || vs.find(v => /zh[-_]CN/i.test(v.lang) && /female|mei|ting|yaoyao|huihui/i.test(v.name))
      || vs.find(v => /^zh/i.test(v.lang)) || null
}
export function pickEnVoice() {
  const vs = speechSynthesis.getVoices()
  return vs.find(v => /^en/i.test(v.lang) && /natural|neural/i.test(v.name))
      || vs.find(v => /^en/i.test(v.lang)) || null
}
function ttsLocal(text: string, lang: string, rate: number, onend?: () => void) {
  if (!('speechSynthesis' in window) || !text) { onend?.(); return }
  try { speechSynthesis.cancel() } catch (e) {}
  let done = false
  const fin = () => { if (done) return; done = true; onend?.() }
  setTimeout(() => { // Chrome drops the utterance if speak() follows cancel() in the same tick
    const u = new SpeechSynthesisUtterance(text)
    u.lang = lang; u.rate = rate
    const v = lang.startsWith('zh') ? pickVoice() : pickEnVoice(); if (v) u.voice = v
    u.onend = () => fin()
    speechSynthesis.speak(u)
    setTimeout(fin, 9000) // safety: onend never fires in some browsers
  }, 80)
}
const gCache = new Map<string, string>()
/* keys: user's own key in settings = direct browser call; otherwise /api/tts proxy with server env
   (ELEVENLABS_API_KEY / OPENAI_API_KEY — server-only, never shipped to the client) */
const EL_KEY = () => S.settings?.elevenKey || ''
const OAI_KEY = () => S.settings?.openaiKey || ''
/* premium AI voices: persistent cache (IndexedDB) + in-flight dedupe — each unique phrase is synthesized exactly once, ever */
const eCache = new Map<string, string>()
const oCache = new Map<string, string>()
const inFlight = new Map<string, Promise<string | null>>()
function fetchTtsCached(cache: Map<string, string>, k: string, url: string, init: RequestInit): Promise<string | null> {
  const hit = cache.get(k); if (hit) return Promise.resolve(hit)
  const live = inFlight.get(k); if (live) return live
  const run = (async () => {
    const idbHit = await getTts(k)
    if (idbHit) { const u = URL.createObjectURL(idbHit); cache.set(k, u); return u }
    try {
      const r = await fetch(url, init)
      if (!r.ok) return null
      const b = await r.blob()
      putTts(k, b)
      const u = URL.createObjectURL(b); cache.set(k, u); return u
    } catch (e) { return null }
  })()
  inFlight.set(k, run); run.finally(() => inFlight.delete(k))
  return run
}
async function elevenUrl(text: string, lang: string): Promise<string | null> {
  /* two voices: EN questions (default Rachel) vs ZH answers (default Alice / settings override) */
  const zh = lang.startsWith('zh')
  const voice = zh ? (S.settings?.elevenVoice || 'Xb7hH8MSUJpSbXTYULwt').trim()
    : (S.settings?.elevenVoiceEn || '21m00Tcm4TlvDq8ikWAM').trim()
  const model = zh ? 'eleven_multilingual_v2' : 'eleven_flash_v2_5'
  const key = EL_KEY()
  const init: RequestInit = key
    ? { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, model_id: model }) }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang, engine: 'eleven', voice }) }
  const url = key
    ? `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`
    : '/api/tts'
  return fetchTtsCached(eCache, 'e|' + voice + '|' + model + '|' + text, url, init)
}
async function openaiUrl(text: string, lang: string): Promise<string | null> {
  const key = OAI_KEY()
  const v = lang.startsWith('zh') ? 'coral' : 'shimmer'
  const init: RequestInit = key
    ? { method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: v, input: text, response_format: 'mp3',
          instructions: lang.startsWith('zh') ? 'Speak warm, clear native Mandarin, moderate pace.' : 'Speak warmly, like a friendly tutor.' }) }
    : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang, engine: 'openai', voice: v }) }
  const url = key ? 'https://api.openai.com/v1/audio/speech' : '/api/tts'
  return fetchTtsCached(oCache, 'o|' + v + '|' + lang + '|' + text, url, init)
}
/* watchdog: if a media element never starts playing (autoplay/silent failure), fall back to device TTS */
function playOrFallback(a: HTMLAudioElement, text: string, lang: string, fin: () => void) {
  let started = false
  const t = setTimeout(() => { if (!started) { try { a.pause() } catch (e) {} ; ttsLocal(text, lang, lang.startsWith('zh') ? 0.9 : 1, fin) } }, 2600)
  a.onplaying = () => { started = true; clearTimeout(t) }
  a.play().catch(() => { clearTimeout(t); ttsLocal(text, lang, lang.startsWith('zh') ? 0.9 : 1, fin) })
}
function gUrl(text: string, lang: string) {
  const k = lang + '|' + text
  let u = gCache.get(k)
  if (!u) { u = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${lang}&q=${encodeURIComponent(text)}`; gCache.set(k, u) }
  return u
}
/* speak: best available engine — natural device voice, else Google TTS */
export function speak(text: string, lang = 'zh-CN', onend?: () => void) {
  if (!text) { onend?.(); return }
  const pref = S.settings?.ttspref || 'auto'
  const zh = lang.startsWith('zh')
  /* auto mode with keys: premium for both voices — EN question voice (Rachel) vs ZH answer voice (Alice) */
  const wantEleven = !!EL_KEY() && (pref === 'eleven' || pref === 'auto')
  const wantOpenai = !!OAI_KEY() && (pref === 'openai' || (pref === 'auto' && !EL_KEY()))
  if (wantEleven || wantOpenai) {
    speakAsync(text, lang, onend); return
  }
  const v = lang.startsWith('zh') ? pickVoice() : pickEnVoice()
  const natural = !!(v && /natural|neural/i.test(v.name))
  const useGoogle = pref === 'google' || (pref !== 'local' && !natural)
  if (useGoogle) {
    try {
      const a = new Audio(gUrl(text, lang.startsWith('zh') ? 'zh-CN' : 'en'))
      let done = false
      const finish = () => { if (done) return; done = true; if (onend) onend() }
      a.onended = () => finish()
      let started = false
      const watch = setTimeout(() => { if (!started) { try { a.pause() } catch (e) {} ; ttsLocal(text, lang, 0.9, finish) } }, 2600)
      a.onplaying = () => { started = true; clearTimeout(watch) }
      a.play().catch(() => { clearTimeout(watch); ttsLocal(text, lang, 0.9, finish) })
      return
    } catch (e) { /* fall through to local */ }
  }
  ttsLocal(text, lang, lang.startsWith('zh') ? 0.9 : 1, onend)
}
/* async engine path: ElevenLabs → OpenAI → local voice */
function speakAsync(text: string, lang: string, onend?: () => void) {
  let done = false
  const fin = () => { if (done) return; done = true; onend?.() }
  elevenUrl(text, lang).then(u => u ? u : openaiUrl(text, lang)).then(u => {
    if (u) { const a = new Audio(u); if (onend) a.onended = () => fin(); playOrFallback(a, text, lang, fin) }
    else ttsLocal(text, lang, lang.startsWith('zh') ? 0.9 : 1, fin)
  })
}
export function tts(text: string, rate?: number) {
  if (!('speechSynthesis' in window) || !text) return
  speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text)
  u.lang = 'zh-CN'; u.rate = rate || 0.9; const v = pickVoice(); if (v) u.voice = v
  speechSynthesis.speak(u)
}
export function soundUrl(note: { sound?: string | null }) {
  if (!note.sound) return null
  return S.mediaMap[note.sound] || S.mediaMap[String(note.sound).toLowerCase()] || null
}
export function imgSrc(note: Note) {
  if (!note.img) return null
  if (String(note.img).startsWith('data/')) return note.img
  return S.mediaMap[String(note.img).toLowerCase()] || null
}
export const FB_EMOJI: Record<string, string> = {'我':'🧍','你':'🫵','他':'🧑','她':'👩','我们':'👥','他们':'👥','好':'👍','不':'🚫','是':'✅','很':'👌','吃':'🍚','喝':'🥤','水':'💧','看':'👀','听':'👂','说':'🗣️','读':'📖','写':'✍️','学':'🎓','学生':'🧑‍🎓','老师':'👩‍🏫','工作':'💼','买':'🛒','钱':'💰','电话':'📞','手机':'📱','电脑':'💻','爱':'❤️','喜欢':'💕','高兴':'😀','难过':'😢','生气':'😠','累':'😪','家':'🏠','房子':'🏡','学校':'🏫','医院':'🏥','商店':'🏪','火车':'🚄','飞机':'✈️','出租车':'🚕','跑':'🏃','睡觉':'😴','睡':'😴','起床':'⏰','早上':'🌅','晚上':'🌙','今天':'📅','明天':'📆','时间':'🕐','猫':'🐱','狗':'🐶','朋友':'🫂','孩子':'🧒','爸爸':'👨','妈妈':'👩'}
export function fallbackArt(note: { sHz?: string; hanzi?: string; id: string }) {
  const hz = (note.sHz || note.hanzi || '?').slice(0, 6)
  let hash = 0; for (const c of String(note.id)) hash = (hash * 31 + c.charCodeAt(0)) >>> 0
  const e = FB_EMOJI[hz] || FB_EMOJI[hz.slice(0, 2)] || FB_EMOJI[hz.slice(0, 1)] || ''
  return `<div class="note-img fb-img" style="--h:${hash % 360}"><span>${e ? e + '<br>' : ''}${esc(hz)}</span></div>`
}
export function playSound(note: Note) {
  const m = soundUrl(note)
  if (m) { const a = new Audio(m); a.play().catch(() => speak(note.hanzi)); return true }
  return false
}
export function playAudio(note: Note) { if (!playSound(note)) speak(note.hanzi || note.pinyin) }
export function playSent(n: Note) {
  const m = n.sSound && soundUrl({ sound: n.sSound })
  if (m) { const a = new Audio(m); a.play().catch(() => speak(n.sHz || n.hanzi)) } else speak(n.sHz || n.hanzi)
}
