"use strict"
/* conversational mode: speech-to-speech practice with an AI. Fully separate session. */
import { S, $, esc } from './state'
import { listenZh, micMeter } from './speech'
import { speak } from './audio'
import { promptSet } from './dom'
import { renderTop, idler, showHome, saveSettings } from './ui'

let chatTok = 0
let prevMode: 'silent' | 'voice' = 'silent'
export function killChat() { chatTok++ }
function chatRender() {
  const log = S.chatLog.map(l => `<div class="qrow ${l.who === 'you' ? 'now' : ''}"><span class="qn">${l.who === 'you' ? '🧑' : '🤖'}</span><span>${esc(l.t)}</span></div>`).join('')
  promptSet(`<div class="hz" style="font-size:30px">💬 Speak Mandarin with your AI partner</div>
    <div class="hint">just talk — it listens and replies out loud. Say “pause” to stop.</div>
    <div id="mic-bar-wrap"><div id="mic-bar"></div></div>
    <div id="chat-line" class="hint" style="font-size:17px;min-height:26px">🎙 listening…</div>
    <div class="qlist">${log || ''}</div>`)
}
export function chatView(from: 'silent' | 'voice' = 'silent') {
  const tok = ++chatTok
  prevMode = from
  S.view = 'chat'
  renderTop()
  if (!S.chatLog.length) S.chatLog.push({ who: 'ai', t: '你好！我们开始聊天吧。(nǐ hǎo! Let\'s chat.)' })
  chatRender()
  const ms = $('mic-state'); if (ms) { ms.classList.remove('ok'); ms.textContent = 'mic connecting…' }
  micMeter(lvl => { const b = $('mic-bar'); if (b) b.style.width = Math.max(2, Math.min(100, lvl * 130)) + '%' })
    .then(h => { if (h && tok === chatTok) { S.chatMeter = h; if (ms) { ms.classList.add('ok'); ms.textContent = '🎙 listening · mic connected' } }
      else if (!h && ms) ms.textContent = '⚠ mic blocked — allow microphone access' })
  chatListen()
}
function chatListen() {
  const tok = chatTok
  listenZh(
    t => { if (tok === chatTok) { const el = $('chat-line'); if (el) el.textContent = '🎙 ' + t } },
    t => { if (tok !== chatTok) return
      if (/\b(pause|stop|quit)\b/i.test(t) && !/[\u4e00-\u9fff]/.test(t)) { chatEnd(); return }
      S.chatLog.push({ who: 'you', t }); chatSend(t) },
    () => { if (tok !== chatTok) return
      const el = $('chat-line'); if (el) el.textContent = '🎙 listening…'
      setTimeout(() => { if (tok === chatTok) chatListen() }, 600) })
}
async function chatSend(text: string) {
  const tok = chatTok
  const el = $('chat-line'); if (el) el.textContent = '🤖 thinking…'
  try {
    const r = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msgs: S.chatLog.slice(-12).map(l => ({ role: l.who === 'you' ? 'user' : 'assistant', content: l.t })) }) })
    if (!r.ok) throw new Error(await r.text())
    const j = await r.json()
    if (tok !== chatTok) return
    S.chatLog.push({ who: 'ai', t: j.reply })
    chatRender()
    speak(j.reply, 'zh-CN', () => { if (tok === chatTok) chatListen() })
  } catch (e: any) {
    if (tok !== chatTok) return
    if (el) el.textContent = '⚠ ' + (String(e.message || e).includes('501') ? 'set OPENAI_API_KEY in Vercel env for conversational mode' : 'chat failed — retrying')
    setTimeout(() => { if (tok === chatTok) chatListen() }, 2500) }
}
function chatEnd() {
  const h = S.chatMeter; if (h) { h.stop(); S.chatMeter = null }
  chatTok++; S.view = 'study'
  S.settings!.mode = prevMode // leave conversational — restore the mode we came from
  saveSettings(); renderTop()
  idler() }
