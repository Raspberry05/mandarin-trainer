"use strict"
import { S, $, esc, today, diag, rollCounts, pOf, persist, isDue, hskLevel, lessons, liveNotes, activeNote, sentReady, sentComplete, sentWords, sHzHas, load, save, LS, type Note, type Prog, type QItem, type Settings } from './state'
import { imgSrc, fallbackArt, playAudio, playSent, soundUrl, pickVoice, speak } from './audio'
import { srSupported, listenZh, listenCmd, parseCommand, micMeter, similarity, PASS, type ListenHandle, type MeterHandle, type Cmd } from './speech'
import { buildQueue, grade, gradeSent } from './srs'
import { saveAll, loadStored } from './idb'
import { loadBundled } from './bundled'
import { importApkg, importTsv } from './anki'
import { removeDeck, resetDeck } from './decks'
import { sb, sbPull, sbInit, sbBtnLabel } from './sync'
import { SB_URL, SB_KEY } from './config'

/* ---------- stats ---------- */
export function statsView() {
  rollCounts()
  const live = S.notes.filter(n => S.decksOn[n.deckId] && !S.progress[n.id]?.leech)
  const due = live.filter(n => isDue(n.id)).length +
    live.filter(n => { const sp = S.progress['S' + n.id]; return sp && sp.due <= Date.now() }).length
  const newLeft = live.filter(n => !S.progress[n.id]).length
  const d = S.studyDeck || ''
  const nToday = (S.counts.n[d] || 0), rToday = (S.counts.r[d] || 0)
  const nLeft = Math.max(0, Math.min(S.settings!.newday, Math.max(0, S.settings!.newday - nToday)))
  $('st-new')!.textContent = nToday + '/' + S.settings!.newday
  $('st-rev')!.textContent = rToday + '/' + S.settings!.maxrev
  $('st-queue')!.textContent = due + (nLeft ? ` (+${Math.min(nLeft, newLeft)} new)` : '')
  $('st-leech')!.textContent = String(S.notes.filter(n => S.progress[n.id]?.leech).length)
  renderTop()
  renderRail()
}

/* ---------- curriculum rail ---------- */
export function renderRail() {
  const all = lessons(); const cur = activeNote()
  const curIdx = cur ? all.indexOf(cur) : all.length
  const done = all.filter(n => S.progress['S' + n.id] || sentComplete(n)).length
  const fill = $('rail-fill'), lbl = $('rail-lbl'), c = $('curriculum')
  if (fill) fill.style.width = (all.length ? Math.round(done / all.length * 100) : 0) + '%'
  if (lbl) lbl.textContent = all.length ? done + ' / ' + all.length + ' (' + Math.round(done / all.length * 100) + '%)' : ''
  if (!c) return
  c.innerHTML = `<h3>curriculum — lesson ${Math.min(curIdx + 1, all.length)} of ${all.length}</h3>`
  const byLvl: Record<string, { n: Note; i: number }[]> = {}
  all.forEach((n, i) => { const L = hskLevel(n); (byLvl[L] = byLvl[L] || []).push({ n, i }) })
  let railInit = S.RAIL_INIT
  for (const L of Object.keys(byLvl)) {
    const lg = byLvl[L]!
    if (!S.RAIL_INIT && cur && hskLevel(cur) === +L) { S.expLevels.add(L); S.RAIL_INIT = true }
    const dn = lg.filter(x => S.progress['S' + x.n.id]).length
    const h = document.createElement('div'); h.className = 'lvl' + (dn === lg.length ? ' done' : '')
    h.innerHTML = `<span>${S.expLevels.has(L) ? '▾' : '▸'} HSK ${L}</span><span class="lvl-c">${dn}/${lg.length}${dn === lg.length ? ' ✓' : ''}</span>`
    h.onclick = () => { S.expLevels.has(L) ? S.expLevels.delete(L) : S.expLevels.add(L); renderRail() }
    c.appendChild(h)
    if (!S.expLevels.has(L)) continue
    for (let s = 0; s < lg.length; s += 10) { const chunk = lg.slice(s, s + 10)
      const key = L + '_' + s
      if (cur && chunk.some(x => x.n === cur)) S.expSubs.add(key)
      const sh = document.createElement('div'); sh.className = 'sub'
      sh.textContent = `${S.expSubs.has(key) ? '▾' : '▸'} lessons ${chunk[0]!.i + 1}–${chunk[chunk.length - 1]!.i + 1}`
      sh.onclick = () => { S.expSubs.has(key) ? S.expSubs.delete(key) : S.expSubs.add(key); renderRail() }
      c.appendChild(sh)
      if (!S.expSubs.has(key)) continue
      for (const { n, i } of chunk) { const d = document.createElement('div')
        d.className = 'les ' + (S.progress['S' + n.id] ? 'done' : (n === cur ? 'cur' : (i < curIdx ? 'done' : 'lock')))
          + ((i <= curIdx) ? ' click' : '')
        d.textContent = (S.progress['S' + n.id] ? '✓ ' : (n === cur ? '▶ ' : '🔒 ')) + (i + 1) + '. ' + (n.sMean || n.sHz)
        if (i <= curIdx) d.onclick = () => { if (n === cur) { S.cur = n; showSentIntro() }
          else { S.queue = [{ sentNote: n }]; route() } }
        else d.onclick = null
        c.appendChild(d) } }
  }
}

/* ---------- view switching ---------- */
export function showHome() {
  S.view = 'home'; $('home-view')!.style.display = ''; $('study-view')!.style.display = 'none'
  $('back-btn')!.style.display = 'none'; $('reset-card-btn')!.style.display = 'none'; renderTop(); renderHome()
}
export function startDeck(d: string) {
  S.view = 'study'; S.studyDeck = d; S.decksOn = {}; S.decksOn[d] = true; saveSettings(); S.sentSeen.clear()
  S.stage = 0
  $('home-view')!.style.display = 'none'; $('study-view')!.style.display = ''
  $('back-btn')!.style.display = ''; $('reset-card-btn')!.style.display = ''; statsView()
  renderTop()
  renderDeckbar()
  if (deckFresh()) placementOffer(); else idler()
}
function deckFresh() {
  const ns = S.notes.filter(n => String(n.deckId) === String(S.studyDeck))
  return !!ns.length && ns.every(n => !S.progress[n.id])
}

/* ---------- auracle-style top bar: lesson name · progress · counts · mode pills ---------- */
let vKill: (() => void) | null = null // current voice session hard-stop (voiceTest/chat)
export function renderTop() {
  if (typeof document === 'undefined') return
  const b = document.body
  b.classList.toggle('study', S.view !== 'home')
  const ns = S.notes.filter(n => String(n.deckId) === String(S.studyDeck))
  const el = $('cur-lesson'); if (el) el.textContent = ns.length ? (ns[0]!.deck || String(S.studyDeck)) : ''
  if (ns.length) {
    const learned = ns.filter(n => S.progress[n.id]?.state === 'review').length
    const learning = ns.filter(n => { const s = S.progress[n.id]?.state; return s === 'learn' || s === 'relearn' }).length
    const news = ns.length - learned - learning
    const pct = Math.round(learned / ns.length * 100)
    const fill = $('top-fill'); if (fill) fill.style.width = pct + '%'
    const tp = $('top-pct'); if (tp) tp.textContent = pct + '% MASTERED'
    const ch = $('top-chips')
    if (ch) ch.innerHTML = `<span class="c-new">● new ${news}</span><span class="c-lrn">● learning ${learning}</span><span class="c-lrd">● learned ${learned}</span>`
  } else { const tp = $('top-pct'); if (tp) tp.textContent = ''; const ch = $('top-chips'); if (ch) ch.innerHTML = ''; const f = $('top-fill'); if (f) f.style.width = '0%' }
  const m = S.settings!.mode || 'silent'
  ;['silent', 'voice', 'chat'].forEach(k => { const p = $('mp-' + k); if (p) p.classList.toggle('on', m === k) })
}

/* ---------- prompt / actions helpers ---------- */
function btn(label: string, cls?: string, fn?: () => void, key?: string) {
  const b = document.createElement('button')
  b.textContent = label; if (cls) b.className = cls; if (key) b.dataset.key = key; b.onclick = fn!; return b
}
export function setActions(...bs: (HTMLButtonElement | null)[]) { const a = $('actions')!; a.innerHTML = ''; bs.filter(Boolean).forEach(b => a.appendChild(b!)) }
function setPrompt(html: string) { $('prompt')!.innerHTML = html; renderTop() }
function fbClear() { const f = $('feedback')!; f.textContent = ''; f.className = '' }
function stopTimer() { clearInterval(S.timerInt); S.timerInt = null; $('timer')!.textContent = '' }
function startTimer() {
  stopTimer(); if (!S.settings!.maxsec) return; S.t0 = Date.now()
  S.timerInt = setInterval(() => {
    const left = Math.max(0, S.settings!.maxsec - (Date.now() - S.t0) / 1000)
    $('timer')!.textContent = Math.ceil(left) + 's'; if (left <= 0) stopTimer()
  }, 250)
}

/* ---------- modes: silent (flashcards) vs voice (mic answers) ---------- */
const qHtml = (m: string) => `<div class="hint">do you know how to say</div>
  <div class="meaning" style="font-size:27px;color:#e8edf3">“${esc(m)}”</div>
  <div class="hint">in Mandarin?</div>`
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
function voice() { return S.settings!.mode === 'voice' }
let micToken = 0
function voiceTest(target: string, pass: () => void, fail: () => void) {
  const tok = ++micToken
  const isSent = S.stage === 4 || S.stage === 5 || S.stage === 6
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
    if (c === 'suspend') { stopCmdAll(); suspendCur(); return }
    if (c === 'pause') { stopCmdAll(); pauseSess(); return } }
  const cmdLoop = () => { if (tok !== micToken || !srSupported()) return
    const g = cmdGen
    setTimeout(() => { if (g !== cmdGen || tok !== micToken) return
      cmdH = listenCmd(onCommand, () => cmdLoop()) }, 300) }
  if (!srSupported()) {
    $('prompt')!.innerHTML += '<div class="hint" style="color:var(--warn)">⚠ mic not supported in this browser — flashcard fallback (Chrome/Edge recommended)</div>'
    setActions(btn('✅ I know it', 'g-next', pass, 'enter'), btn('❌ I don\'t know it', 'g-again', fail))
    return
  }
  const upNext = () => {
    if (!voice()) return ''
    const rows = S.queue.slice(0, 6).map((e, ix) => {
      const n = 'sentNote' in e ? e.sentNote : e
      const m = (S.stage === 4 || S.stage === 5 || S.stage === 6 || S.stage === 7) ? (n.sMean || n.sHz) : (n.meaning || n.pinyin)
      const t = ix === 0 ? '· now' : ''
      return `<div class="qrow${ix === 0 ? ' now' : ''}"><span class="qn">${ix + 1}</span><span>${esc(m || n.hanzi)}</span>${t ? `<span class="hint">${t}</span>` : ''}</div>` })
    return rows.length > 1 ? `<div class="qlist"><div class="hint" style="text-align:left">up next</div>${rows.join('')}</div>` : ''
  }
  $('prompt')!.innerHTML += `<div id="att-list"></div>
    <div id="q-card"><span class="qz">${esc(qText)}</span><span class="qint">${fmtIvl()}</span></div>
    ${rv ? `<div id="reveal-card" style="display:none"><span class="rlbl">correct answer</span><span class="rhz">${esc(rv.hz)}</span><span class="rpy">${esc(rv.py)}</span></div>` : ''}
    <div id="mic-line" class="hint" style="font-size:17px;min-height:26px"></div>
    <div id="mic-bar-wrap"><div id="mic-bar"></div></div>
    <div id="cmd-row">
      <button id="cmd-susp">⏸ Suspend please<span class="zh">請暫停卡片</span></button>
      <button id="cmd-pass">→ Pass please<span class="zh">請跳過</span></button>
    </div>
    <div id="mic-ctl" class="btnrow"></div>` + upNext()
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

/* ---------- placement quiz ---------- */
export function placementOffer() {
  S.stage = 0; $('stage-lbl')!.textContent = 'placement'
  setPrompt(`<div class="hz" style="font-size:28px">🧪 Placement quiz</div>
    <div class="hint">a few quick questions — if you already know some HSK levels,<br>
      we'll unlock straight past them so you never repeat what you've learnt.</div><br>
    <div class="hint">or start from zero below.</div>`)
  fbClear()
  setActions(btn('🧪 Take placement quiz', 'primary', startQuiz),
    btn('Start from zero', undefined, idler, 'enter'))
}
export function startQuiz() {
  const all = lessons(); const byL: Record<string, Note[]> = {}
  all.forEach(n => { const L = hskLevel(n); (byL[L] = byL[L] || []).push(n) })
  S.pqItems = []; for (const L of Object.keys(byL)) { const lg = byL[L]!
    const picks = lg.length >= 6 ? [lg[Math.floor(lg.length * .25)]!, lg[Math.floor(lg.length * .75)]!] : [lg[Math.floor(lg.length / 2)]!]
    for (const n of picks) S.pqItems.push(n) }
  S.pqItems.sort((a, b) => (a.k || 0) - (b.k || 0)); S.pqIdx = 0; pqShow()
}
function pqShow() {
  const n = S.pqItems[S.pqIdx]; if (!n) return pqDone()
  S.cur = n; S.stage = 0; $('stage-lbl')!.textContent = `placement ${S.pqIdx + 1}/${S.pqItems.length}`
  setPrompt(`<div class="hz" style="font-size:38px">${esc(n.sHz || n.hanzi)}</div>
    <div class="py" style="font-size:22px">${esc(n.sPy)}</div>
    <div class="meaning">${esc(n.sMean)}</div>
    <div class="hint">🔊 do you already understand — and could say — this sentence?</div>`)
  fbClear()
  if (!S.settings!.noautoplay) playSent(n)
  setActions(btn('🔊 Replay', undefined, () => playSent(n), 'space'),
    btn('✅ I know it', 'g-good', () => { S.pqIdx++; pqShow() }, 'enter'),
    btn('❌ Not yet', 'g-again', pqDone))
}
function pqDone() {
  const known = S.pqItems.slice(0, S.pqIdx)
  const cnt: Record<number, number> = {}, kn: Record<number, number> = {}
  S.pqItems.forEach(n => { cnt[hskLevel(n)] = (cnt[hskLevel(n)] || 0) + 1 })
  known.forEach(n => { kn[hskLevel(n)] = (kn[hskLevel(n)] || 0) + 1 })
  let cutLvl = 0; for (let L = 1; L <= 6; L++) { if (!cnt[L]) break; if (kn[L] === cnt[L]) cutLvl = L; else break }
  let unlocked = 0
  if (cutLvl) { const lk = lessons().filter(n => hskLevel(n) <= cutLvl); unlocked = lk.length
    for (const n of lk) { const p = pOf(n.id); p.sentDone = true; p.skipped = true; p.state = 'review'
      p.ivl = Math.max(1, p.ivl || 2); p.due = Date.now() + 2 * 864e5 }
    persist() }
  S.stage = 0; $('stage-lbl')!.textContent = 'placement done'
  setPrompt(`<div class="hz" style="font-size:30px">${cutLvl ? `🎉 Unlocked through HSK ${cutLvl}` : '🌱 Starting from HSK 1'}</div>
    <div class="hint">${cutLvl ? unlocked + ' lesson(s) marked as already known — your first new lesson is next up.' : 'We\'ll teach you everything from the start.'}</div>`)
  setActions(btn('▶ Start learning', 'primary', idler, 'enter'))
}

/* ---------- home / deck grid ---------- */
export function renderHome() {
  const ids = [...new Set(S.notes.map(n => n.deckId))]
  const g = $('deck-grid')!
  g.innerHTML = ''
  if (!ids.length) { g.innerHTML = '<div class="hint" style="text-align:center;width:100%">No decks yet — import an .apkg above, or drop it here.</div>'; return }
  rollCounts()
  const FLAG: Record<string, string> = {
    zh: '<div class="flagbar"><svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><rect width="30" height="20" fill="#de2910"/><text x="2.5" y="7.2" font-size="5.6" fill="#ffde00">★</text><text x="10" y="3.6" font-size="2.6" fill="#ffde00">★</text><text x="11.8" y="5.8" font-size="2.6" fill="#ffde00">★</text><text x="11.8" y="8.9" font-size="2.6" fill="#ffde00">★</text><text x="10" y="11" font-size="2.6" fill="#ffde00">★</text></svg></div>',
    es: '<div class="flagbar"><svg viewBox="0 0 30 20" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice"><rect width="30" height="20" fill="#c60b1e"/><rect y="5" width="30" height="10" fill="#ffc400"/></svg></div>' }
  for (const d of ids) {
    const ns = S.notes.filter(n => n.deckId === d)
    const first = ns[0] || ({} as Partial<Note>)
    const name = esc(first.deck || String(d).replace(/^tsv-/, ''))
    const newC = ns.filter(n => !S.progress[n.id]).length
    const revC = ns.filter(n => S.progress[n.id]?.state === 'review').length
    const learnC = ns.length - newC - revC
    const dueC = ns.filter(n => isDue(n.id) || (S.progress['S' + n.id]?.due || 1 / 0) <= Date.now()).length
    const sentC = ns.filter(n => S.progress['S' + n.id]).length
    const doneC = ns.filter(n => S.progress[n.id]?.state === 'review').length
    const desc = first.desc ? `<div class="ddesc">${esc(String(first.desc).replace(/<[^>]*>/g, ' ').slice(0, 140))}</div>` : ''
    const lang = first.lang === 'zh' ? '<span class="langtag">Mandarin · Simplified</span>' : ''
    const card = document.createElement('div'); card.className = 'deckcard'
    const bundled = String(d) === 'mz'
    card.innerHTML = `${FLAG[first.lang || ''] || ''}<h3>${name} ${lang}</h3>
      <div class="dmeta">${ns.length} cards · <b>${newC}</b> new · ${learnC} learning · <b>${revC}</b> reviewing${doneC ? ` · ${doneC} done` : ''}<br>
      ${dueC ? `<b>${dueC} ready now</b> · ` : ''}${sentC} sentence(s) unlocked</div>${desc}
      <div class="dbtns"><button class="dreset" data-r="${esc(String(d))}">♻ reset</button>
      ${bundled ? '' : `<button class="dreset dx" data-x="${esc(String(d))}" data-n="${esc(first.deck || String(d))}">🗑 remove</button>`}</div>`
    card.onclick = e => { if ((e.target as HTMLElement).closest('.dreset')) return; startDeck(d) }
    g.appendChild(card)
  }
  const soon = document.createElement('div'); soon.className = 'deckcard soon'
  soon.innerHTML = `${FLAG.es}<h3>Spanish</h3><div class="dmeta">Curriculum in preparation — coming soon.</div>`
  g.appendChild(soon)
  g.querySelectorAll('.dreset').forEach(b => (b as HTMLElement).onclick = e => {
    e.stopPropagation(); resetDeck((b as HTMLElement).dataset.r!) })
  g.querySelectorAll('.dx').forEach(b => (b as HTMLElement).onclick = e => {
    e.stopPropagation(); const el = b as HTMLElement; removeDeck(el.dataset.x!, el.dataset.n!) })
}
function renderDeckbar() {
  const ids = [...new Set(S.notes.map(n => n.deckId))]
  const bar = $('deckbar')!; bar.innerHTML = ''
  for (const d of ids) { const c = document.createElement('span')
    c.className = 'chip' + (S.decksOn[d] ? ' on' : '')
    c.textContent = (S.decksOn[d] ? '✓ ' : '') + d + ' (' + S.notes.filter(n => n.deckId === d).length + ')'
    c.onclick = () => { S.decksOn[d] = !S.decksOn[d]; saveSettings(); renderDeckbar(); statsView(); idler() }; bar.appendChild(c) }
}

/* ---------- idler / queue routing ---------- */
export function idler() {
  if (S.idleTimer) { clearInterval(S.idleTimer); S.idleTimer = null }
  if (S.studyDeck && !S.notes.some(n => String(n.deckId) === String(S.studyDeck))) { showHome(); return }
  S.queue = buildQueue()
  if (!S.queue.length) {
    const act = activeNote()
    let goal = ''
    if (act && sHzHas(act)) { const Str = act.sHz || act.sMean; const seen = new Set<string>(); let left = 0
      for (const m of S.notes) { if (!m.hanzi || seen.has(m.hanzi)) continue; seen.add(m.hanzi)
        const st = S.progress[m.id]?.state
        if (Str.includes(m.hanzi) && (st === 'learn' || st === 'relearn')) left++ }
      goal = `<br><br>🎯 current goal: <b>${esc(act.sMean || act.sHz)}</b><br><span class="hint">${left ? left + ' word(s) in learning steps — auto-resuming when their timer hits' : 'waiting on learning-step timers (≤2 min)'}</span>` }
    $('stage-lbl')!.textContent = 'all caught up'
    setPrompt('<span class="hint">' + (act ? 'Caught up.' : 'No cards due. Import more decks on the home screen.') + goal + '</span>')
    setActions(...[act ? btn('🛑 Enough for today', 'g-again', showHome) : null,
      act ? btn('▶ Continue to next sentence', 'primary', skipGateCore, 'enter') : null,
      act ? btn('📚 Review past sentences', undefined, reviewPast) : null,
      act ? btn('🧪 Placement quiz', undefined, startQuiz) : null,
      btn('🔄 Rebuild queue', undefined, idler)].filter(Boolean as any))
    S.cur = null; statsView()
    S.idleTimer = setInterval(idler, 5000); return
  }
  route()
}
function skipGateCore() { const act = activeNote(); if (!act) return
  const p = pOf(act.id); p.sentDone = true; p.skipped = true; p.state = 'review'; p.ivl = Math.max(1, p.ivl || 2)
  p.due = Date.now() + 2 * 864e5; persist(); idler() }
function reviewPast() { const live = liveNotes()
  const past = live.filter(n => S.progress['S' + n.id])
    .sort((a, b) => (S.progress['S' + a.id]!.due || 0) - (S.progress['S' + b.id]!.due || 0))
  if (!past.length) { alert('No sentences learned yet.'); return }
  S.queue = past.map(n => ({ sentNote: n })); route() }
function route() {
  const e = S.queue[0]
  if (e && 'sentNote' in e) { S.cur = e.sentNote
    S.progress['S' + S.cur.id] ? showSentTest() : showSentQ(); return }
  S.cur = e as Note
  if (!(S.cur as Note).hanzi) { S.queue.shift(); if (!S.queue.length) { idler(); return } route(); return }
  const isNew = !S.progress[S.cur!.id] || S.progress[S.cur!.id]!.state === 'new'
  if (isNew) { const act = activeNote()
    if (act && sHzHas(act) && !S.sentSeen.has(act.id)) { S.sentSeen.add(act.id); showSentIntro(); return }
    showListen(); return }
  showWordTest()
}

/* ---------- card views ---------- */
function audioWarn() { return (S.cur!.sound && !soundUrl(S.cur!)) ? '<div class="hint">⚠ deck audio missing — TTS voice</div>' : '' }
export function fullView(note: Note) {
  const iu = imgSrc(note)
  return `<div class="py">${esc(note.pinyin) || '<span class="hint">(no pinyin)</span>'}</div>
    <div class="hz">${esc(note.hanzi)}</div>
    ${iu ? `<img class="note-img" src="${iu}" data-hz="${esc(note.hanzi || '')}" alt="">` : fallbackArt(note)}
    <div class="meaning">${esc(note.meaning)}</div>`
}
function mm(n: Note) { // longest-match tokenizer for sentence html
  const Str = n.sHz || n.hanzi || ''
  const cand = S.notes.filter(m => m.hanzi && m.hanzi.length > 1)
  let html = ''; let i = 0
  while (i < Str.length) { let hit: Note | null = null
    for (const m of cand) { if (Str.startsWith(m.hanzi, i) && (!hit || m.hanzi.length > hit.hanzi.length)) hit = m }
    if (hit) { html += `<span class="sw" data-t="${esc(hit.pinyin)} · ${esc(hit.meaning)}">${esc(hit.hanzi)}</span>`; i += hit.hanzi.length }
    else { html += esc(Str[i]); i++ } }
  return html
}
function sentHtml(n: Note) { return mm(n) }
function sentView(note: Note) {
  const su = note.sSound && soundUrl({ sound: note.sSound })
  const iu = imgSrc(note)
  return `${iu ? `<img class="note-img" src="${iu}" data-hz="${esc(note.hanzi || '')}" alt="">` : fallbackArt(note)}
    <div class="hz" style="font-size:30px">${sentHtml(note)}</div>
    <div class="py" style="font-size:22px">${esc(note.sPy)}</div>
    <div class="meaning">${esc(note.sMean)}</div>
    ${su ? '' : '<div class="hint">⚠ no sentence audio — TTS</div>'}`
}

/* intro: today's sentence */
export function showSentIntro() {
  const A = activeNote() || S.cur!; S.stage = 0; $('stage-lbl')!.textContent = `lesson — ${S.cur!.deck}`
  setPrompt(`<div class="hint">today you'll learn to say:</div>
    <div class="hz" style="font-size:34px">${esc(A.sHz)}</div>
    <div class="py" style="font-size:26px">${esc(A.sPy)}</div>
    <div class="meaning">${esc(A.sMean)}</div>
    ${imgSrcFull(A)}
    <div class="hint">🔊 just listen for now. then we break it down word by word.</div>`)
  fbClear()
  if (!S.settings!.noautoplay) playSent(A)
  setActions(btn('🔊 Replay sentence', undefined, () => playSent(A), 'space'),
    btn('Break it down →', 'primary', showListen, 'enter'))
}
function imgSrcFull(A: Note) {
  const iu = imgSrc(A)
  return iu ? `<img class="note-img" src="${iu}" data-hz="${esc(A.hanzi || '')}" alt="">` : fallbackArt(A)
}
export function showListen() {
  S.stage = 1; $('stage-lbl')!.textContent = `word — ${S.cur!.deck}`
  setPrompt(fullView(S.cur!) + audioWarn() + `<div class="hint">a piece of your sentence: 🔊 + pinyin + hanzi + meaning</div>`)
  fbClear()
  if (!S.settings!.noautoplay) playAudio(S.cur!)
  setActions(btn('🔊 Word', undefined, () => playAudio(S.cur!), 'space'),
    btn('Test me →', 'primary', showWordTest, 'enter'))
}
function showWordTest() {
  S.stage = 2; $('stage-lbl')!.textContent = 'test — how do you say it?'
  const m = S.cur!.meaning || S.cur!.pinyin
  setPrompt(qHtml(m))
  fbClear()
  if (voice()) return voiceTest(m, () => testReveal(true), () => testReveal(false))
  setActions(btn('✅ I know it', 'g-next', () => testReveal(true), 'enter'),
    btn('❌ I don\'t know it', 'g-again', () => testReveal(false)))
}
function removeCard() { if (!S.cur) return
  if (!confirm('Delete "' + (S.cur.hanzi || '') + '" permanently from this deck?')) return
  S.notes = S.notes.filter(n => n.id !== S.cur!.id)
  delete S.progress[S.cur!.id]; delete S.progress['S' + S.cur!.id]
  persist(); const iid = S.queue.indexOf(S.cur!); if (iid >= 0) S.queue.splice(iid, 1)
  if (!S.queue.length) { idler(); return } route() }
/* auracle-style: suspend parks the card (relearn-style push-out), pause stops the hands-free loop */
function suspendCur() { if (!S.cur) return micToken++
  const p = S.progress[S.cur.id]; if (!p) return advance()
  p.skipped = true; p.sentDone = true; p.state = 'review'; p.ivl = Math.max(2, p.ivl || 2)
  p.due = Date.now() + 7 * 864e5
  persist(); S.diagLog.push('suspend ' + S.cur.id + ' ' + today())
  S.queue.shift(); S.stage = 0
  if (!S.queue.length) { idler(); return } route() }
function pauseSess() { micToken++
  try { speechSynthesis.cancel() } catch (e) {}
  setPrompt('<div class="hz" style="font-size:34px">⏸ paused</div><div class="hint">session paused — the deck keeps its place.</div>')
  setActions(btn('▶️ Resume', 'primary', route, 'enter')) }
function testReveal(known: boolean) {
  S.stage = 3
  setPrompt(fullView(S.cur!) + audioWarn() +
    (known ? '<div class="hint">knew it — graded Good, next review pushed out</div>'
           : '<div class="hint">didn\'t know — graded Again, repeats soon</div>'))
  playAudio(S.cur!)
  setActions(btn('🔊 Replay', undefined, () => playAudio(S.cur!), 'space'),
    btn('Continue →', 'primary', () => finish(known ? 2 : 0), 'enter'))
}
export function showSentQ() {
  S.stage = 5; $('stage-lbl')!.textContent = 'sentence — first practice'
  const m = S.cur!.sMean || S.cur!.sHz
  setPrompt(qHtml(m) + `<div class="hint">you know every word in it. say the whole sentence aloud.</div>`)
  fbClear()
  if (voice()) return voiceTest(m, () => sentRevealDone(), () => showSentFail())
  setActions(btn('✅ I know it', 'g-next', () => sentRevealDone(), 'enter'),
    btn('❌ I don\'t know it', 'g-again', () => showSentFail()))
}
/* fixed: legacy shipped showSentR calls that crashed — now aliased to sentence reveal */
function showSentR() { sentRevealDone() }
function finish(action: number) {
  grade(action)
  const cur = S.cur!
  const p = S.progress[cur.id]
  if (p && p.state === 'review' && !S.progress['S' + cur.id] && sentReady(cur)) {
    S.queue.splice(Math.min(3, S.queue.length), 0, { sentNote: cur }) }
  S.queue.shift(); S.stage = 0
  const extra = liveNotes().filter(n => isDue(n.id) && !S.queue.includes(n as any)).slice(0, 50)
  S.queue.unshift(...extra)
  if (!S.queue.length) { idler(); return } route()
}
export function showSentTest() {
  S.stage = 4; $('stage-lbl')!.textContent = 'sentence review — how do you say it?'
  const m = S.cur!.sMean || S.cur!.sHz
  setPrompt(qHtml(m) + `<div class="hint">hanzi reveals after you answer.</div>`)
  fbClear()
  if (voice()) return voiceTest(m, () => { gradeSent(2); sentRevealDone() }, () => { gradeSent(0); showSentFail() })
  if (!S.settings!.noautoplay) playSent(S.cur!)
  setActions(btn('🔊 Replay', undefined, () => playSent(S.cur!), 'space'),
    btn('✅ I know it', 'g-good', () => { gradeSent(2); sentRevealDone() }, 'enter'),
    btn('❌ I don\'t know it', 'g-again', () => { gradeSent(0); showSentFail() }))
}
function sentRevealDone() {
  S.stage = 5
  const sp = S.progress['S' + S.cur!.id]
  const days = sp && sp.due > Date.now() ? Math.max(1, Math.round((sp.due - Date.now()) / 864e5)) : null
  setPrompt(sentView(S.cur!) + `<div class="hint">${days ? `sentence passed — next review in ~${days} day(s)` : 'sentence passed — next review later, Anki-style'}</div>`)
  playSent(S.cur!)
  setActions(btn('🔊 Replay', undefined, () => playSent(S.cur!), 'space'),
    btn('Next →', 'primary', advance, 'enter'))
}
function showSentFail() {
  S.stage = 6; $('stage-lbl')!.textContent = 'sentence forgotten — relearn the words'
  const ws = sentWords(S.cur!)
  setPrompt(`<div class="hint">tap any word you don't remember to review its meaning:</div>
    <div class="hz" style="font-size:36px;line-height:1.7">${sentHtml(S.cur!)}</div>
    <div class="meaning">${esc(S.cur!.sMean)}</div>
    ${ws.length ? `<div class="word-chips">${ws.map(m => `<button class="chip" data-w="${esc(m.id)}">${esc(m.hanzi)}</button>`).join('')}</div>` : ''}
    <div class="hint">hover the underlined words above too — tap chips for the full card.</div>`)
  fbClear()
  $('prompt')!.querySelectorAll('button[data-w]').forEach(b => {
    const el = b as HTMLElement
    const m = S.notes.find(x => x.id === el.dataset.w); if (m) el.onclick = () => showWordCard(m, showSentFail) })
  setActions(...[...ws.slice(0, 8).map(m => btn(m.hanzi, undefined, () => showWordCard(m))),
    btn('🔁 Try the sentence again', 'primary', showSentRetest, 'enter')])
}
function showWordCard(m: Note, back?: () => void) {
  setPrompt(fullView(m) +
    (m.sHz ? `<hr style="border-color:var(--bd);width:100%"><div class="hz" style="font-size:26px">${sentHtml(m)}</div><div class="meaning">${esc(m.sMean)}</div>` : ''))
  playAudio(m)
  setActions(btn('🔊 Word', undefined, () => playAudio(m), 'space'),
    m.sSound ? btn('🔊 Its sentence', undefined, () => playSent(m)) : null,
    btn('← Back', 'primary', back, 'enter'))
}
export function showSentRetest() {
  S.stage = 7; $('stage-lbl')!.textContent = 'sentence — try again'
  setPrompt(`<div class="hint">one more time — how do you say:</div>
    <div class="meaning" style="font-size:27px;color:#e8edf3">${esc(S.cur!.sMean || S.cur!.sHz)}</div>`)
  fbClear()
  setActions(btn('✅ I said it', 'g-next', () => { gradeSent(1); sentRevealDone() }, 'enter'),
    btn('👀 Show me', 'g-hard', () => showSentR()),
    btn('❌ Still no', 'g-again', () => { gradeSent(0); showSentFail() }))
}
function advance() {
  const e = S.queue[0]
  if (e && 'sentNote' in e) { const sid = 'S' + e.sentNote.id
    if (!S.progress[sid]) { S.progress[sid] = { state: 'review', step: 0, due: Date.now() + 2 * 864e5, ivl: 2, ease: 2.5 } as Prog
      const wp = S.progress[e.sentNote.id]; if (wp && !wp.sentDone) { wp.sentDone = true }
      persist() } }
  S.queue.shift(); S.stage = 0
  if (!S.queue.length) { idler(); return } route()
}

/* ---------- settings UI ---------- */
const SKEYS = ['newday', 'maxrev', 'steps', 'relearn', 'leech', 'leechact', 'noautoplay', 'waitaudio', 'maxsec', 'newsrt', 'revsrt', 'newafter', 'ret', 'maxivl', 'mode', 'ttspref', 'elevenKey', 'elevenVoice', 'elevenVoiceEn', 'openaiKey']
export function saveSettings() { save(LS.s, S.settings); sbPushIfUser() }
function sbPushIfUser() { import('./bundled').then(m => m.sbPush().catch(() => {})) }
function fillSettings(src: Partial<Settings>) {
  SKEYS.forEach(k => { const el = $('s-' + k) as HTMLInputElement
    if (el) (el as any)[((el as HTMLInputElement).type === 'checkbox') ? 'checked' : 'value'] = (src as any)[k]! })
  const ps = $('s-preset') as HTMLSelectElement; ps.innerHTML = ''; for (const n of Object.keys(S.presets)) {
    const o = document.createElement('option'); o.textContent = n; ps.appendChild(o) }
  ;(ps as HTMLSelectElement).value = 'Default'
}
function readSettings() {
  SKEYS.forEach(k => { const el = $('s-' + k) as HTMLInputElement
    ;(S.settings as any)[k] = (el as HTMLInputElement).type === 'checkbox' ? (el as HTMLInputElement).checked : ((el as HTMLInputElement).type === 'number' ? +(el as HTMLInputElement).value : (el as HTMLInputElement).value) })
  saveSettings()
}
function openSettings() { fillSettings(S.settings!); $('settings-modal')!.classList.add('open') }
function closeSettings() { readSettings(); statsView(); $('settings-modal')!.classList.remove('open') }
function applyModeLabel() { renderTop() }

/* ---------- conversational mode: speech-to-speech practice with an AI ---------- */
let chatTok = 0
function chatRender() {
  const log = S.chatLog.map(l => `<div class="qrow ${l.who === 'you' ? 'now' : ''}"><span class="qn">${l.who === 'you' ? '🧑' : '🤖'}</span><span>${esc(l.t)}</span></div>`).join('')
  $('prompt')!.innerHTML = `<div class="hz" style="font-size:30px">💬 Speak Mandarin with your AI partner</div>
    <div class="hint">just talk — it listens and replies out loud. Say “pause” to stop.</div>
    <div id="mic-bar-wrap"><div id="mic-bar"></div></div>
    <div id="chat-line" class="hint" style="font-size:17px;min-height:26px">🎙 listening…</div>
    <div class="qlist">${log || ''}</div>`
}
function chatView() {
  const tok = ++chatTok
  micToken++ // kills study mic loop
  S.view = 'chat'
  renderTop()
  if (!S.notes.length) { alert('Import a deck first so the AI knows your vocabulary.'); showHome(); return }
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
  chatTok++; micToken++; S.view = 'study'
  idler() }


/* ---------- build info ---------- */
function relTime(t: number) { const s = (Date.now() - t) / 1000
  if (s < 60) return Math.max(0, Math.floor(s)) + 's ago'
  if (s < 3600) return Math.floor(s / 60) + 'm ago'
  if (s < 86400) return Math.floor(s / 3600) + 'h ago'
  return Math.floor(s / 86400) + 'd ago' }
function renderBuild() {
  if (!S.lastCommit) return
  const outdated = S.BUILD_DATE < S.lastCommit.t - 21600e3 ? ' <span class="hint">(outdated — refreshing…)</span>' : ''
  $('build-info')!.innerHTML = `build <b>${S.lastCommit.sha}</b> · updated ${relTime(S.lastCommit.t)}${outdated}`
  if (outdated && !sessionStorage.getItem('ast_reloaded')) {
    sessionStorage.setItem('ast_reloaded', '1')
    setTimeout(() => location.reload(), 2500) }
}
async function loadBuild() { try {
  const r = await fetch('https://api.github.com/repos/Raspberry05/mandarin-trainer/commits/master')
  if (!r.ok) throw 0; const j = await r.json()
  S.lastCommit = { sha: j.sha.slice(0, 7), t: new Date(j.commit.committer.date).getTime() }
  renderBuild()
} catch (e) { const el = $('build-info'); if (el) el.textContent = 'build info unavailable' } }

/* ---------- Supabase auth modal ---------- */
function sbModal(open: boolean) { $('auth-modal')!.classList.toggle('open', open) }
async function sbSend() {
  const msg = $('auth-msg')!; msg.textContent = 'sending code…'
  const e = ($('auth-email') as HTMLInputElement).value.trim()
  if (!e) { msg.textContent = '⚠ enter your email'; return }
  const { error } = await sb.auth.signInWithOtp({ email: e, options: { shouldCreateUser: true } })
  if (error) { msg.textContent = '⚠ ' + error.message; return }
  msg.textContent = '✅ code sent — check your inbox (and spam)'
  $('auth-code-wrap')!.style.display = ''; ($('auth-verify') as HTMLElement).style.display = ''
}
async function sbVerify() {
  const msg = $('auth-msg')!
  const code = ($('auth-code') as HTMLInputElement).value.trim()
  const email = ($('auth-email') as HTMLInputElement).value.trim()
  if (!code) { msg.textContent = '⚠ enter the code from the email'; return }
  const { data, error } = await sb.auth.verifyOtp({ email, token: code, type: 'email' })
  if (error) { msg.textContent = '⚠ ' + error.message; return }
  S.sbUser = data.user; sbBtnLabel(); sbModal(false)
  document.getElementById('import-status')!.innerHTML = '✅ signed in — progress syncing'
  sbPull()
}
async function sbSignOut() { try { await sb.auth.signOut() } catch (e) {}
  S.sbUser = null; sbBtnLabel(); sbModal(false) }

/* ---------- import flow ---------- */
async function importFiles(files: File[]) {
  const status: string[] = []
  for (const f of files) { try {
    const prog = (t: string) => { status[status.length - 1] = `⏳ ${f.name}: ${t}`; $('import-status')!.innerHTML = status.join('<br>') }
    status.push(`⏳ ${f.name}…`)
    let got: Note[], report: any = null
    if (/\.apkg$|\.colpkg$/i.test(f.name)) { const res = await importApkg(f, prog); got = res.notes; report = res.report }
    else got = importTsv(await f.text(), f.name)
    if (!got.length) { status[status.length - 1] = `⚠️ ${f.name}: 0 notes found (empty or wrong format)`; continue }
    const isStub = (n: Note) => /please update to the latest anki version|import the .colpkg\/\.apkg file again/i.test(n.hanzi + ' ' + n.meaning)
    const stubs = got.filter(isStub)
    if (stubs.length && stubs.length === got.length) {
      status[status.length - 1] = `❌ ${f.name}: STUB package (${stubs.length}/${got.length} notes are placeholders). Sample: "${esc(String(got[0].hanzi).slice(0, 90))}". AnkiWeb gave a pointer file — re-download the real deck via Anki Desktop 24+. Nothing imported.`; continue }
    if (stubs.length) { got = got.filter(n => !isStub(n))
      status.push(`&nbsp;&nbsp;↳ filtered ${stubs.length} placeholder notes`) }
    const gids = new Set(got.map(n => n.deckId)); gids.forEach(g => { if (!(g in S.decksOn)) S.decksOn[g] = true })
    S.notes = S.notes.filter(n => !gids.has(n.deckId)).concat(got)
    const mediaN = Object.keys(S.mediaMap).length
    const miss = got.filter(n => n.sound && !S.mediaMap[String(n.sound).toLowerCase()]).length
    status[status.length - 1] = `✅ ${f.name}: ${got.length} notes, ${gids.size} deck(s), audio files: ${mediaN}${miss ? ` · ⚠ ${miss} notes point to missing audio` : ''}`
    if (report) for (const r of Object.values(report) as any[]) {
      status.push(`&nbsp;&nbsp;↳ notetype "${r.model}" — hanzi←"${r.hanzi}" · pinyin←"${r.pinyin}" · meaning←"${r.meaning}" · audio←"${r.audio || '(none)'}"`)
      status.push(`&nbsp;&nbsp;↳ sample: "${esc(String(got[0].hanzi).slice(0, 30))}" | "${esc(String(got[0].pinyin).slice(0, 30))}" | "${esc(String(got[0].meaning).slice(0, 40))}" | ${got[0].sound ? `[sound:${esc(got[0].sound)}]` : 'no audio'}`) }
  } catch (err: any) { status.push(`❌ ${f.name}: ${err.message}`) } }
  $('import-status')!.innerHTML = status.join('<br>')
  await saveAll()
  showHome()
}

/* ---------- init / wiring ---------- */
export function init() {
  ;($('import-btn') as HTMLElement)!.onclick = () => ($('file-in') as HTMLElement)!.click()
  ;($('back-btn') as HTMLElement)!.onclick = showHome as any
  ;($('file-in') as HTMLInputElement)!.onchange = e => {
    const files = [...(e.target as HTMLInputElement).files as unknown as File[]]
    ;(e.target as HTMLInputElement).value = ''; importFiles(files) }
  window.addEventListener('dragenter', e => { e.preventDefault(); S.dragDepth++; $('drop-overlay')!.classList.add('show') })
  window.addEventListener('dragover', e => e.preventDefault())
  window.addEventListener('dragleave', e => { S.dragDepth--; if (S.dragDepth <= 0) { S.dragDepth = 0; $('drop-overlay')!.classList.remove('show') } })
  window.addEventListener('drop', e => {
    e.preventDefault(); S.dragDepth = 0; $('drop-overlay')!.classList.remove('show')
    if (e.dataTransfer?.files?.length) importFiles([...e.dataTransfer.files as unknown as File[]]) })
  ;($('settings-btn') as HTMLElement)!.onclick = openSettings
  ;($('mode-btn') as HTMLElement)!.onclick = () => {} // legacy hidden — pills below
  const setMode = (m: 'silent' | 'voice' | 'chat') => {
    S.settings!.mode = m
    saveSettings(); renderTop()
    micToken++; chatTok++; vKill?.(); vKill = null // kill any live voice/chat session
    if (m === 'chat') { chatView(); return }
    if (S.view === 'study') idler() }
  ;(['silent', 'voice', 'chat'] as const).forEach(k => { const p = $('mp-' + k) as HTMLElement | null; if (p) p.onclick = () => setMode(k) })
  ;($('v-pause') as HTMLElement)!.onclick = () => { micToken++; chatTok++; vKill?.(); vKill = null; pauseSess() }
  ;($('v-set') as HTMLElement)!.onclick = openSettings
  ;($('v-help') as HTMLElement)!.onclick = () =>
    alert('Voice mode: listen to the question, then just say the answer out loud in Mandarin. ' +
      'If it doesn\'t match, the question is repeated — say "pass" to hear the answer and echo it back. ' +
      'Voice commands: "again" (repeat question), "pass" (show answer), "suspend" (skip card), "pause".')
  ;($('v-exit') as HTMLElement)!.onclick = () => {
    micToken++; chatTok++; vKill?.(); vKill = null
    try { speechSynthesis.cancel() } catch (e) {}
    showHome() }
  applyModeLabel()
  ;($('reset-card-btn') as HTMLElement)!.onclick = () => {
    if (!S.studyDeck) { alert('No deck active.'); return }
    const ns = S.notes.filter(n => n.deckId === S.studyDeck)
    if (!confirm(`Reset ALL progress for this deck (${ns.length} cards)? Everything starts over.`)) return
    for (const n of ns) { delete S.progress[n.id]; delete S.progress['S' + n.id] }
    S.counts.n[S.studyDeck] = 0; S.counts.r[S.studyDeck] = 0; S.counts.s = S.counts.s || {}; S.counts.s[S.studyDeck] = 0
    persist(); statsView()
    S.sentSeen.clear(); S.queue = []; idler() }
  ;($('settings-close') as HTMLElement)!.onclick = closeSettings
  ;($('auth-btn') as HTMLElement)!.onclick = () => {
    if (S.sbUser) { ($('auth-out') as HTMLElement)!.style.display = ''
      $('auth-msg')!.textContent = 'signed in as ' + (S.sbUser.email || '') + ' — progress auto-syncs'; sbModal(true) }
    else { ($('auth-out') as HTMLElement)!.style.display = 'none';
      ($('auth-code-wrap') as HTMLElement)!.style.display = 'none';
      ($('auth-verify') as HTMLElement)!.style.display = 'none';
      $('auth-msg')!.textContent = ''; sbModal(true) } }
  ;($('auth-send') as HTMLElement)!.onclick = sbSend
  ;($('auth-verify') as HTMLElement)!.onclick = sbVerify
  ;($('auth-out') as HTMLElement)!.onclick = sbSignOut
  ;($('auth-cancel') as HTMLElement)!.onclick = () => sbModal(false)
  ;($('deck-close') as HTMLElement)!.onclick = () => $('deck-modal')!.classList.remove('open')
  ;($('preset-save') as HTMLElement)!.onclick = () => {
    const n = ($('s-pname') as HTMLInputElement).value.trim() || 'Default'
    readSettings(); S.presets[n] = { ...S.settings! }; save(LS.pr, S.presets); openSettings() }
  ;($('preset-del') as HTMLElement)!.onclick = () => {
    const n = ($('s-preset') as HTMLSelectElement).value
    if (n === 'Default') { alert('Cannot delete Default'); return }
    delete S.presets[n]; save(LS.pr, S.presets); ($('s-preset') as HTMLSelectElement).value = 'Default' }
  ;(($('s-preset') as HTMLSelectElement)).onchange = () => {
    const p = S.presets[($('s-preset') as HTMLSelectElement).value]; if (!p) return
    fillSettings({ ...(S.settings || {})!, ...p })
    const sel = $('s-preset') as HTMLSelectElement
    sel.value = sel.selectedOptions[0]!.textContent! }

  document.addEventListener('keydown', e => {
    const t = e.target as HTMLElement
    if (t.tagName === 'INPUT') return
    if (e.key === ' ') { e.preventDefault(); if (S.cur) playAudio(S.cur as Note); return }
    if (e.key === 'Enter') { e.preventDefault()
      const a = $('actions')!.querySelector('button.primary') || $('actions')!.querySelector(S.stage === 2 ? 'button.g-good' : 'button.g-next')
      if (a) (a as HTMLElement).click(); return }
    const map: Record<string, number> = { '1': 0, '2': 1, '3': 2, '4': 3 }
    if (e.key in map) { const b = $('actions')!.querySelectorAll('.g-again,.g-hard,.g-good,.g-easy')[map[e.key]!]; if (b) (b as HTMLElement).click() } })

  window.onerror = (message, src, lineno) => diag('JS error: ' + message + ' @ ' + String(src || '').split('/').pop() + ':' + lineno)
  window.addEventListener('unhandledrejection', (e: any) => diag('Promise error: ' + ((e.reason && e.reason.message) || e.reason)))

  const prime = () => { try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u) } catch (e) {} }
  document.addEventListener('click', prime, { once: true })

  boot()
}
async function boot() {
  speechSynthesis.onvoiceschanged = () => pickVoice()
  import('./idb') // warm
  sbInit()
  ;($('boot') as HTMLElement)!.style.display = 'none'
  loadBuild(); setInterval(renderBuild, 30000)
  try { diag('boot: loading saved decks…')
    await loadStored()
    showHome()
    diag('boot: loading bundled curricula…')
    const added = await loadBundled()
    showHome()
    diag(`boot done: notes=${S.notes.length} decks=${new Set(S.notes.map(n => n.deckId)).size} bundled=${added}`) }
  catch (e) { diag('boot failed: ' + e); showHome()
    document.getElementById('import-status')!.innerHTML = '⚠ startup issue: ' + esc(String(e)) + ' — refresh the page; if it repeats, report this text.' }
}

