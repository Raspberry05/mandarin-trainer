"use strict"
import { S, rollCounts, isDue, pOf, persist, parseSteps, mult, liveNotes, activeNote, sentReady, normHz, hskLevel, levelComplete, countKey, type Note, type Prog, type QItem } from './state'

/* ---------- queue / schedule ---------- */
export function buildQueue(): QItem[] {
  const live = liveNotes()
  const rev = live.filter(n => isDue(n.id))
  if (S.settings!.revsrt.startsWith('Random')) rev.sort(() => Math.random() - .5)
  else rev.sort((a, b) => (S.progress[a.id]!.due - S.progress[b.id]!.due) + (Math.random() - .5) * 10)
  const revN = rev.slice(0, S.settings!.maxrev)
  const sentDue = live.filter(n => { const sp = S.progress['S' + n.id]; return sp && sp.due <= Date.now() })
  let head: QItem[] = []; let newQ: Note[] = []
  const act = activeNote()
  if (act) {
    const Str = act.sHz || act.sMean
    const words = live.filter(n => n.hanzi && Str.includes(n.hanzi) && (!S.progress[n.id] || S.progress[n.id]!.state === 'new'))
    // brand-new lesson: voice mode opens with the sentence question itself; flashcard only when nothing else pending
    const neverSeen = !S.progress['S' + act.id] && !S.sentSeen.has(act.id)
    if (neverSeen && (act.sHz || act.sMean) && (S.settings!.mode === 'voice' || !words.length)) head = [{ sentNote: act }]
    else if (words.length) newQ = words.sort((a, b) => (a.k || 0) - (b.k || 0) || (a.id < b.id ? -1 : 1))
      .slice(0, Math.max(0, Math.min(S.settings!.newday, S.settings!.newday - ((S.counts.n[countKey()]) || 0))))
    else if (!S.progress['S' + act.id] && sentReady(act)) head = [{ sentNote: act }]
  }
  let q = S.settings!.newafter ? [...head, ...revN, ...sentDue, ...newQ] : [...head, ...newQ, ...revN, ...sentDue]
  // bury siblings: same hanzi only once per session (sent items keyed separately)
  const seen = new Set<string>()
  q = q.filter(n => { const k = 'sentNote' in n ? 'S' + n.sentNote.id : normHz(n.hanzi); if (seen.has(k)) return false; seen.add(k); return true })
  return q
}

export function grade(action: number, q: QItem[] = S.queue) {
  const cur = S.cur!;
  const p = pOf(cur.id); const L = parseSteps(S.settings!.steps) || [5, 50, 120]
  const R = parseSteps(S.settings!.relearn) || [5, 50, 120]; const m = mult()
  rollCounts()
  const dk = countKey()
  if (p.state === 'new' || p.state === 'learn') {
    if (action === 0) { p.state = 'learn'; p.step = 0; p.due = Date.now() + L[0]! * 1000 }
    else if (action === 1) { p.state = 'learn'; p.due = Date.now() + (L[p.step]! * 1.5) * 1000 }
    else if (action === 2) { if (p.state === 'new') S.counts.n[dk] = (S.counts.n[dk] || 0) + 1; p.state = 'learn'
      if (p.step + 1 >= L.length) { p.state = 'review'; p.ivl = 1; p.due = Date.now() + 864e5 }
      else { p.step++; p.due = Date.now() + L[p.step]! * 1000 } }
    else { if (p.state === 'new') S.counts.n[dk] = (S.counts.n[dk] || 0) + 1; p.state = 'review'; p.ivl = 4; p.due = Date.now() + 4 * 864e5 }
  } else if (p.state === 'review') {
    S.counts.r[dk] = (S.counts.r[dk] || 0) + 1
    if (action === 0) { p.lapses = (p.lapses || 0) + 1; p.ease = Math.max(1.3, p.ease - 0.2); p.state = 'relearn'; p.step = 0; p.due = Date.now() + R[0]! * 1000
      if (p.lapses >= S.settings!.leech) { if (S.settings!.leechact.startsWith('Suspend')) p.leech = true; else p.tag = true } }
    else {
      if (action === 1) { p.ease = Math.max(1.3, p.ease - 0.15); p.ivl = Math.max(1, Math.round(p.ivl * 1.2 * m)) }
      if (action === 2) { p.ivl = Math.max(1, Math.round(p.ivl * p.ease * m)) }
      if (action === 3) { p.ease = Math.min(3.0, p.ease + 0.1); p.ivl = Math.round(p.ivl * p.ease * m * 1.3) }
      p.ivl = Math.min(p.ivl, S.settings!.maxivl)
      p.due = Date.now() + p.ivl * 864e5 }
  } else if (p.state === 'relearn') {
    if (action === 0) { p.step = 0; p.due = Date.now() + R[0]! * 1000 }
    else if (action === 1) { p.due = Date.now() + R[p.step]! * 1500 }
    else if (action === 2) {
      if (p.step + 1 >= R.length) { p.state = 'review'; p.ivl = Math.max(1, Math.round(p.ivl * 0.5)); p.due = Date.now() + p.ivl * 864e5 }
      else { p.step++; p.due = Date.now() + R[p.step]! * 1000 } }
    else { p.state = 'review'; p.ivl = Math.max(2, Math.round(p.ivl * 0.7)); p.due = Date.now() + p.ivl * 864e5 }
  }
  persist() // UI refresh is the caller's job — scheduler stays pure
}

export function gradeSent(a: number) {
  const cur = S.cur!
  const id = 'S' + cur.id
  const existed = !!S.progress[id]
  const p = S.progress[id] || (S.progress[id] = { state: 'review', step: 0, due: 0, ivl: 2, ease: 2.5 } as Prog)
  if (a !== 0 && !existed) {
    S.counts.s = S.counts.s || {}; const dk = countKey(); S.counts.s[dk] = (S.counts.s[dk] || 0) + 1
    const lvl = hskLevel(cur)
    if (levelComplete(lvl) && !sessionStorage.getItem('hskc' + lvl)) { sessionStorage.setItem('hskc' + lvl, '1')
      setTimeout(() => alert(`🎉 Congratulations — HSK ${lvl} complete! Every sentence in this level is learned.`), 600) }
  }
  if (a === 0) { p.ivl = Math.max(1, Math.round(p.ivl * 0.4)); p.ease = Math.max(1.3, (p.ease || 2.5) - 0.2); p.due = Date.now() + 5 * 60e3 }
  else {
    if (a === 1) { p.ease = Math.max(1.3, (p.ease || 2.5) - 0.15); p.ivl = Math.max(1, Math.round(p.ivl * 1.2)) }
    else if (a === 2) { p.ivl = Math.max(1, Math.round(p.ivl * (p.ease || 2.5))) }
    else { p.ease = Math.min(3.0, (p.ease || 2.5) + 0.1); p.ivl = Math.round(p.ivl * (p.ease || 2.5) * 1.3) }
    p.ivl = Math.min(p.ivl, S.settings!.maxivl); p.due = Date.now() + p.ivl * 864e5 }
  persist() // UI refresh is the caller's job — scheduler stays pure
}


