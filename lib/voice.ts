"use strict"
/* voice session: auracle-style ask → listen → match → (mismatch: re-ask until "pass") → reveal → echo.
   Self-contained: owns the mic token lifecycle. Study-flow effects (suspend/pause) are injected. */
import { S, $, esc, type Note } from './state'
import { playAudio, playSent, speak } from './audio'
import { srSupported, listenZh, listenCmd, micMeter, similarity, PASS, type ListenHandle, type MeterHandle, type Cmd } from './speech'
import { btn, setActions, promptAppend } from './dom'

let micToken = 0
let vKill: (() => void) | null = null
export function killVoice() { micToken++; try { vKill?.() } catch (e) {} vKill = null }
export function voiceMode() { return S.settings!.mode === 'voice' }

/* grammar particles get a natural spoken prompt, not "how do you say 'indicates possession…'" */
const GRAMMAR_MEANING = /^(indicates?|denotes?|expresses?|marks?|particle|aspect|marker|grammatical|a grammatical|possessive|possessions?|complet\w*|attach\w*|added|adds|adds a|used (for|to|when|with|after|before|as|at|by|in)|shows?)\b/i
const PARTICLE_HZ = /^(的|了|吗|呢|吧|嘛|呗|啊|呀|哦|嗯|着|过|得|们|之)$/
function isGrammarNote(n: Note) {
  const core = (n.hanzi || '').split(/[\/\s]/)[0] || ''
  return GRAMMAR_MEANING.test((n.meaning || '').trim()) || (core.length <= 2 && PARTICLE_HZ.test(core))
}
function naturalAsk(n: Note | null, target: string, sent: boolean) {
  if (sent || !n || !isGrammarNote(n)) return `Do you know how to say ${target} in Mandarin?`
  const low = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
  const m = (n.meaning || target).trim().replace(/[.。]$/, '')
  if (/^(particle|aspect|marker|grammatical|a grammatical)/i.test(m)) return `In Mandarin, this is ${low(m)}. Say it out loud.`
  if (/^(indicates?|denotes?|expresses?|marks?|attach\w*|added|adds|shows?|used |complet\w*|possess\w*)/i.test(m))
    return `For this one: in Mandarin, it ${low(m)}. Say it out loud.`
  return `For this one, in Mandarin, it's a little grammar word — it's used for ${target}. Say it out loud.`
}

export interface VoiceIO { suspend: () => void; pause: () => void; sent: boolean }

export function voiceTest(target: string, pass: () => void, fail: () => void, io: VoiceIO) {
  const tok = ++micToken
  const isSent = io.sent
  const sayAnswer = () => { const n = S.cur!; if (isSent) playSent(n); else playAudio(n) }
  const qText = naturalAsk(S.cur, target, isSent)
  const sayQ = (cb?: () => void) => speak(qText, 'en', cb)
  const rv = S.cur!.hanzi ? (isSent ? { hz: S.cur!.sHz, py: S.cur!.sPy } : { hz: S.cur!.hanzi, py: S.cur!.pinyin }) : null
  let cmdH: ListenHandle | null = null
  let meterH: MeterHandle | null = null
  let cmdGen = 0 // bumping kills any queued cmdLoop re-arm — no dual-listener mic contention
  const stopCmd = () => { cmdH?.stop(); cmdH = null; cmdGen++ }
  const stopCmdAll = () => { stopCmd(); meterH?.stop(); meterH = null; micToken = tok + 1; vKill = null } // hard exit: voiceTest becomes a no-op
  const startMeter = () => { if (meterH) return
    const ms = $('mic-state'); if (ms) ms.textContent = 'mic connecting…'
    micMeter(lvl => { const b = $('mic-bar'); if (b) b.style.width = Math.max(2, Math.min(100, lvl * 130)) + '%' })
      .then(h => { meterH = h; if (h) { if (ms) { ms.classList.add('ok'); ms.textContent = '🎙 listening · mic connected' } }
        else { ($('mic-bar-wrap') as HTMLElement).style.opacity = '.35'; if (ms) { ms.classList.remove('ok'); ms.textContent = '⚠ mic blocked — allow microphone access' } } }) }
  let tries = 0, echo = false
  const atts: { t: string; sim: number; ok?: boolean }[] = []
  const renderAtt = () => { const el = $('att-list'); if (!el) return
    el.innerHTML = atts.map((a, i) => `<div class="att${i === atts.length - 1 ? ' now' : ''}"><span class="${a.ok ? 'ok' : 'x'}">${a.ok ? '✓' : '✗'}</span><span>“${esc(a.t)}”</span><span class="hint" style="margin-left:auto">${Math.round(a.sim * 100)}%</span></div>`).join('') }
  const fmtIvl = () => { const p = isSent ? S.progress['S' + S.cur!.id] : S.progress[S.cur!.id]
    if (!p || p.state === 'new') return 'new'
    if ((p.ivl || 0) < 1) return Math.max(1, Math.round((p.ivl || 0.01) * 1440)) + 'm'
    return Math.round(p.ivl) + 'd' }
  function onCommand(c: Cmd) {
    if (tok !== micToken) return
    if (c === 'again') { stopCmd(); line.textContent = '🔁 repeating the question…'; sayQ(() => { if (tok === micToken) listenOnce() }); return }
    if (c === 'pass') { stopCmdAll(); auraclePass(); return }
    if (c === 'suspend') { stopCmdAll(); io.suspend(); return }
    if (c === 'pause') { stopCmdAll(); io.pause(); return } }
  const cmdLoop = () => { if (tok !== micToken || !srSupported()) return
    const g = cmdGen
    setTimeout(() => { if (g !== cmdGen || tok !== micToken) return
      cmdH = listenCmd(onCommand, () => cmdLoop()) }, 300) }
  if (!srSupported()) {
    promptAppend('<div class="hint" style="color:var(--warn)">⚠ mic not supported in this browser — flashcard fallback (Chrome/Edge recommended)</div>')
    setActions(btn('✅ I know it', 'g-next', pass, 'enter'), btn('❌ I don\'t know it', 'g-again', fail))
    return
  }
  const upNext = () => {
    const rows = S.queue.slice(0, 6).map((e, ix) => {
      const n = 'sentNote' in e ? e.sentNote : e
      const m = isSent ? (n.sMean || n.sHz) : (n.meaning || n.pinyin)
      const t = ix === 0 ? '· now' : ''
      return `<div class="qrow${ix === 0 ? ' now' : ''}"><span class="qn">${ix + 1}</span><span>${esc(m || n.hanzi)}</span>${t ? `<span class="hint">${t}</span>` : ''}</div>` })
    return rows.length > 1 ? `<div class="qlist"><div class="hint" style="text-align:left">up next</div>${rows.join('')}</div>` : ''
  }
  promptAppend(`<div id="att-list"></div>
    <div id="q-card"><span class="qz">${esc(qText)}</span><span class="qint">${fmtIvl()}</span></div>
    ${rv ? `<div id="reveal-card" style="display:none"><span class="rlbl">correct answer</span><span class="rhz">${esc(rv.hz)}</span><span class="rpy">${esc(rv.py)}</span></div>` : ''}
    <div id="mic-line" class="hint" style="font-size:17px;min-height:26px"></div>
    <div id="mic-bar-wrap"><div id="mic-bar"></div></div>
    <div id="cmd-row">
      <button id="cmd-susp">⏸ Suspend please<span class="zh">請暫停卡片</span></button>
      <button id="cmd-pass">→ Pass please<span class="zh">請跳過</span></button>
    </div>
    <div id="mic-ctl" class="btnrow"></div>` + upNext())
  const line = $('mic-line')!, ctl = $('mic-ctl')!
  const ms = $('mic-state'); if (ms) ms.classList.remove('ok')
  startMeter()
  const replay = btn('🔊 Replay question', undefined, () => { sayQ() })
  const arm = () => { if (tok !== micToken) return
    ctl.innerHTML = ''; line.textContent = echo ? '🎙 echo it — say the answer out loud' : '🎙 listening… say it in Mandarin' }
  const listenOnce = () => { if (tok !== micToken) return
    stopCmd()
    line.textContent = echo ? '🎙 echo it — say the answer out loud' : '🎙 listening… say it in Mandarin'
    let h: ListenHandle | null = null
    setTimeout(() => { // let the question audio fully finish — mic must not hear the TTS tail
      if (tok !== micToken) return
      h = listenZh(
      t => { if (tok === micToken) line.textContent = '🎙 ' + t },
      t => { if (tok !== micToken) return
        const sim = similarity(t, target)
        if (sim >= PASS) {
          atts.push({ t, sim, ok: true }); renderAtt()
          if (echo) { // auracle: they needed the answer first — grade Again, show the reveal
            line.innerHTML = `✅ echoed: “${esc(t)}” <span class="hint">— graded Again so it comes back soon</span>`
            stopCmdAll(); setTimeout(() => { if (tok === micToken) fail() }, 1300) }
          else { line.innerHTML = `✅ heard: “${esc(t)}” <span class="hint">(${Math.round(sim * 100)}% match)</span>`
            ctl.innerHTML = ''; stopCmdAll(); setTimeout(() => { if (tok === micToken) pass() }, 1100) } }
        else reAttempt(t, sim) },
      e => { if (tok !== micToken) return
        // silence (no-speech / onend-without-match): auto re-listen twice before giving up
        if (!echo && tries < 2 && /catch anything|no-speech/i.test(String(e))) {
          tries++; line.textContent = "🎙 didn't catch anything — listening again…"
          setTimeout(() => { if (tok === micToken) listenOnce() }, 900); return }
        line.textContent = '⚠ ' + e; ctl.innerHTML = ''; ctl.appendChild(replay); cmdLoop() })
    }, 450)
  }
  const reAttempt = (heard?: string, sim = 0) => {
    if (tok !== micToken) return
    tries++
    if (heard != null) { atts.push({ t: heard, sim }); renderAtt() }
    const label = echo ? 'not quite — one more echo…' : `not quite — I'll ask again (attempt ${tries})`
    line.innerHTML = `❌ “${esc(heard || '')}” <span class="hint">(${Math.round(sim * 100)}% match) — ${label}</span>`
    setTimeout(() => { if (tok !== micToken) return
      sayQ(() => { if (tok === micToken) listenOnce() }) }, echo ? 900 : 1500)
  }
  const auraclePass = () => { // "pass please": show + speak the answer, then re-ask until you echo it correctly
    if (tok !== micToken) return
    tries = 0; echo = true
    try { speechSynthesis.cancel() } catch (e) {}
    const rc = $('reveal-card'); if (rc) rc.style.display = ''
    line.textContent = '🔊 the answer — listen, then say it back'
    ctl.innerHTML = ''
    sayAnswer()
    setTimeout(() => { if (tok !== micToken) return
      sayQ(() => { if (tok === micToken) listenOnce() }) }, 2800)
  }
  ;($('cmd-susp') as HTMLElement)!.onclick = () => onCommand('suspend')
  ;($('cmd-pass') as HTMLElement)!.onclick = () => onCommand('pass')
  vKill = stopCmdAll
  sayQ(() => { if (tok === micToken) listenOnce() }) // auto-listen after the question is spoken
  arm(); cmdLoop()
}
