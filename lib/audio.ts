"use strict"
import { S, esc, Note } from './state'

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
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = lang; u.rate = rate
  const v = lang.startsWith('zh') ? pickVoice() : pickEnVoice(); if (v) u.voice = v
  if (onend) u.onend = () => onend()
  speechSynthesis.speak(u)
  if (onend) setTimeout(onend, 9000) // safety: onend never fires in some browsers
}
const gCache = new Map<string, string>()
/* ElevenLabs: best AI voices — needs the user's API key + voice id in settings */
const eCache = new Map<string, string>()
async function elevenUrl(text: string, lang: string): Promise<string | null> {
  const key = S.settings?.elevenKey || ''
  if (!key) return null
  const voice = (S.settings?.elevenVoice || 'JBFqnCBsd6RMkjVDRZzb').trim()
  const k = voice + '|' + lang + '|' + text
  let u = eCache.get(k)
  if (u) return u
  try {
    const model = lang.startsWith('zh') ? 'eleven_multilingual_v2' : 'eleven_flash_v2_5'
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: model }) })
    if (!r.ok) return null
    const b = await r.blob()
    u = URL.createObjectURL(b); eCache.set(k, u); return u
  } catch (e) { return null }
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
  const elevenify = !!S.settings?.elevenKey && (pref === 'eleven' || (pref === 'auto' && lang.startsWith('zh')))
  if (elevenify) {
    speakAsync(text, lang, onend); return
  }
  const v = lang.startsWith('zh') ? pickVoice() : pickEnVoice()
  const natural = !!(v && /natural|neural/i.test(v.name))
  const useGoogle = pref === 'google' || (pref !== 'local' && !natural)
  if (useGoogle) {
    try {
      const a = new Audio(gUrl(text, lang.startsWith('zh') ? 'zh-CN' : 'en'))
      if (onend) a.onended = () => onend()
      a.play().catch(() => { ttsLocal(text, lang, 0.9); if (onend) setTimeout(onend, 600) })
      return
    } catch (e) { /* fall through to local */ }
  }
  ttsLocal(text, lang, lang.startsWith('zh') ? 0.9 : 1, onend)
}
/* async engine path: ElevenLabs fetch, fallback to local voice */
function speakAsync(text: string, lang: string, onend?: () => void) {
  elevenUrl(text, lang).then(u => {
    if (u) { const a = new Audio(u); if (onend) a.onended = () => onend(); a.play().catch(() => ttsLocal(text, lang, 0.9, onend)) }
    else ttsLocal(text, lang, lang.startsWith('zh') ? 0.9 : 1, onend)
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
