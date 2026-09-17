"use strict"
import { S, esc, diag, Note } from './state'
import { getTts, putTts } from './idb'

/* ---------- TTS & audio ---------- */
/* single-live-audio rule: every playback takes the channel — returning to a page can no longer echo
   the previous clip under the new one (committed fix for double-audio on revisit) */
let liveA: HTMLAudioElement | null = null
export function killAudio() {
  try { liveA?.pause(); liveA?.removeAttribute('src') } catch (e) {}
  liveA = null
  try { speechSynthesis.cancel() } catch (e) {}
}
function hold(a: HTMLAudioElement) {
  try { if (liveA && liveA !== a) { liveA.pause(); liveA.removeAttribute('src') } } catch (e) {}
  liveA = a; return a
}
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
  /* no Mandarin voice installed? an English device voice would garble the hanzi —
     run the Mandarin text through Google TTS first, device synth only as last resort */
  if (lang.startsWith('zh') && !pickVoice()) {
    try {
      const a = hold(new Audio(gUrl(text, 'zh-CN')))
      let started = false
      const w = setTimeout(() => { if (!started) { try { a.pause() } catch (e) {} ; synth() } }, 3200)
      a.onended = () => fin()
      a.onplaying = () => { started = true; clearTimeout(w) }
      a.play().catch(() => { clearTimeout(w); synth() })
      return
    } catch (e) { /* fall through to synth */ }
  }
  synth()
  function synth() {
    setTimeout(() => { // Chrome drops the utterance if speak() follows cancel() in the same tick
      const u = new SpeechSynthesisUtterance(text)
      u.lang = lang; u.rate = rate
      const v = lang.startsWith('zh') ? pickVoice() : pickEnVoice(); if (v) u.voice = v
      u.onend = () => fin()
      speechSynthesis.speak(u)
      setTimeout(fin, 9000) // safety: onend never fires in some browsers
    }, 80)
  }
}
const gCache = new Map<string, string>()
/* keys: user's own key in settings = direct browser call; otherwise /api/tts proxy with server env
   (ELEVENLABS_API_KEY / OPENAI_API_KEY — server-only, never shipped to the client) */
const EL_KEY = () => S.settings?.elevenKey || ''
const OAI_KEY = () => S.settings?.openaiKey || ''
/* premium AI voices: persistent cache (IndexedDB) + in-flight dedupe + session failure cache —
   each unique phrase is synthesized exactly once; failed engine attempts aren't retried this page-load */
const eCache = new Map<string, string>()
const oCache = new Map<string, string>()
const inFlight = new Map<string, Promise<string | null>>()
const ttsFailed = new Set<string>()
function fetchTtsCached(cache: Map<string, string>, k: string, url: string, init: RequestInit): Promise<string | null> {
  if (ttsFailed.has(k)) return Promise.resolve(null)
  const hit = cache.get(k); if (hit) return Promise.resolve(hit)
  const live = inFlight.get(k); if (live) return live
  const run = (async () => {
    const idbHit = await getTts(k)
    if (idbHit) { const u = URL.createObjectURL(idbHit); cache.set(k, u); return u }
    try {
      const r = await fetch(url, init)
      if (!r.ok) { ttsFailed.add(k); diag('tts ' + (url.startsWith('/') ? 'proxy' : 'direct') + ' HTTP ' + r.status + (url.startsWith('/') ? '' : ' voice=' + k.split('|')[1])); return null }
      const b = await r.blob()
      putTts(k, b)
      const u = URL.createObjectURL(b); cache.set(k, u); return u
    } catch (e) { ttsFailed.add(k); return null }
  })()
  inFlight.set(k, run); run.finally(() => inFlight.delete(k))
  return run
}
async function elevenUrl(text: string, lang: string): Promise<string | null> {
  /* elevenlabs chain: personal key direct call (with account-voice fallback, 3 tries)
     → server proxy (free-tier workspace, verified working) — every branch ends audible */
  const zh = lang.startsWith('zh')
  const model = zh ? 'eleven_multilingual_v2' : 'eleven_flash_v2_5'
  const key = EL_KEY()
  if (key && !directDead) {
    let voice = zh ? (S.settings?.elevenVoice || 'Xb7hH8MSUJpSbSDYk0k2').trim()
      : (S.settings?.elevenVoiceEn || 'JBFqnCBsd6RMkjVDRZzb').trim()
    if (resolvedVoice[zh ? 'zh' : 'en']) voice = resolvedVoice[zh ? 'zh' : 'en']
    else if (!userVoices) userVoices = fetchUserVoices(key)
    const direct = (v: string) => fetchTtsCached(eCache, 'e|' + v + '|' + model + '|' + text,
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(v)}?output_format=mp3_44100_128`,
      { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ text, model_id: model }) })
    let u = await direct(voice)
    if (!u && userVoices) {
      // settings voice invalid/premium for this account — try their workspace's zh/en voices, up to 3
      const vs = await userVoices
      const cands = [voice, ...vs.filter(v => zh ? /^zh|cmn/i.test(v.language || '') : /^en/i.test(v.language || '')).map(v => v.id),
        ...vs.map(v => v.id)].filter((id, i, a) => id && a.indexOf(id) === i).slice(0, 3)
      for (const c of cands) {
        if (c === voice) continue
        u = await direct(c)
        if (u) { resolvedVoice[zh ? 'zh' : 'en'] = c; diag('eleven direct voice resolved: ' + c); break } }
    }
    if (u) return u
    directDead = true // personal key unusable — stop wasting calls, use the server proxy
  }
  return proxyEleven(text, lang, model)
}
let userVoices: Promise<{ id: string; language?: string }[]> | null = null
let directDead = false
const resolvedVoice: Record<string, string> = {} // lang-side -> voice id that actually worked for this account
async function fetchUserVoices(key: string) {
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/voices', { headers: { 'xi-api-key': key } })
    if (!r.ok) { diag('eleven voices list: HTTP ' + r.status); return [] }
    const j = await r.json()
    return (j.voices || []).map((v: any) => ({ id: v.voice_id, language: v.labels?.language }))
  } catch (e) { diag('eleven voices list failed: ' + e); return [] }
}
async function proxyEleven(text: string, lang: string, model: string): Promise<string | null> {
  const zh = lang.startsWith('zh')
  const first = zh ? (S.settings?.elevenVoice || 'Xb7hH8MSUJpSbSDYk0k2').trim()
    : (S.settings?.elevenVoiceEn || 'JBFqnCBsd6RMkjVDRZzb').trim()
  const via = (v: string) => fetchTtsCached(eCache, 'ep|' + v + '|' + model + '|' + text, '/api/tts',
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text, lang, engine: 'eleven', voice: v }) })
  let u = await via(first)
  if (!u) { // custom voice premium/invalid on server workspace — fall to verified free defaults
    const dflt = zh ? 'Xb7hH8MSUJpSbSDYk0k2' : 'JBFqnCBsd6RMkjVDRZzb'
    if (first !== dflt) u = await via(dflt)
  }
  return u
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
/* speak: engine chain — user key direct call, else /api/tts proxy (server env ElevenLabs/OpenAI), else Google/device */
export function speak(text: string, lang = 'zh-CN', onend?: () => void) {
  if (!text) { onend?.(); return }
  const pref = S.settings?.ttspref || 'auto'
  if (pref === 'auto' || pref === 'eleven' || pref === 'openai') {
    /* auto/eleven/openai always try the async chain: elevenUrl uses the user's key when present,
       otherwise POSTs /api/tts (server ELEVENLABS_API_KEY) — failures fall through to openai then local */
    speakAsync(text, lang, onend); return
  }
  const v = lang.startsWith('zh') ? pickVoice() : pickEnVoice()
  const natural = !!(v && /natural|neural/i.test(v.name))
  const useGoogle = pref === 'google' || (pref !== 'local' && !natural)
  if (useGoogle) {
    try {
      const a = hold(new Audio(gUrl(text, lang.startsWith('zh') ? 'zh-CN' : 'en')))
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
    if (u) { const a = hold(new Audio(u)); if (onend) a.onended = () => fin(); playOrFallback(a, text, lang, fin) }
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
  if (m) { hold(new Audio(m)).play().catch(() => speak(note.hanzi)); return true }
  return false
}
export function playAudio(note: Note) { if (!playSound(note)) speak(note.hanzi || note.pinyin) }
export function playSent(n: Note) {
  const m = n.sSound && soundUrl({ sound: n.sSound })
  if (m) { hold(new Audio(m)).play().catch(() => speak(n.sHz || n.hanzi)) } else speak(n.sHz || n.hanzi)
}
