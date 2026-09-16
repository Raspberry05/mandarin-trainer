"use strict"
/* ---------- types ---------- */
export interface Note {
  id: string; deckId: string; deck: string; lang?: string; desc?: string
  hanzi: string; pinyin: string; meaning: string; sound: string | null; img: string | null
  sHz: string; sPy: string; sMean: string; sSound: string | null; k: number
}
export interface Prog {
  state: 'new' | 'learn' | 'relearn' | 'review'; step: number; due: number; ivl: number; ease: number
  lapses?: number; sentDone?: boolean; skipped?: boolean; leech?: boolean; tag?: boolean
}
export interface Settings {
  newday: number; maxrev: number; steps: string; relearn: string; leech: number; leechact: string
  noautoplay: boolean; waitaudio: boolean; maxsec: number; newsrt: string; revsrt: string
  newafter: boolean; ret: number; maxivl: number
  mode?: 'silent' | 'voice' | 'chat'; ttspref?: 'auto' | 'local' | 'google' | 'eleven' | 'openai'
  elevenKey?: string; elevenVoice?: string; elevenVoiceEn?: string; openaiKey?: string
}
export type QItem = Note | { sentNote: Note }

/* ---------- storage ---------- */
export const LS = { p: 'ast_progress', s: 'ast_settings', pr: 'ast_presets', c: 'ast_counts', bdo: 'ast_bundled_off', lastmod: 'ast_lastmod' }
export const load = (k: string, d: any) => { try { return JSON.parse(localStorage.getItem(k) as any) ?? d } catch (e) { return d } }
export const save = (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v))

export const DEF: Settings = { newday: 9999, maxrev: 9999, steps: '1m 5m 1d', relearn: '1m 5m 1d', leech: 6, leechact: 'Suspend Card',
  noautoplay: false, waitaudio: false, maxsec: 60, newsrt: 'Random', revsrt: 'Due date, then random', newafter: true, ret: 90, maxivl: 36500,
  mode: 'voice' as 'silent' | 'voice', ttspref: 'auto' as 'auto' | 'local' | 'google' | 'eleven' | 'openai' }

/* ---------- global mutable state ---------- */
export const S = {
  progress: load(LS.p, {}) as Record<string, Prog>,
  settings: load(LS.s, null as Settings | null),
  presets: load(LS.pr, {}) as Record<string, Partial<Settings>>,
  counts: load(LS.c, { d: '', n: {}, r: {} }) as { d: string; n: Record<string, number>; r: Record<string, number>; s?: Record<string, number> },
  notes: [] as Note[],
  mediaMap: {} as Record<string, string>,   // filename -> blobURL (per import)
  mediaBlobs: {} as Record<string, Blob>,   // filename -> Blob (for IndexedDB persistence)
  decksOn: {} as Record<string, boolean>,
  levelFilter: {} as Record<string, number | null>, // deckId -> HSK level (null = all levels)
  cur: null as Note | null,
  stage: 0,
  queue: [] as QItem[],
  view: 'home' as 'home' | 'deckpage' | 'study' | 'chat',
  studyDeck: null as string | null,
  diagLog: [] as string[],
  lastCommit: null as null | { sha: string; t: number },
  sbUser: null as any,
  sbTimer: null as any,
  timerInt: null as any,
  t0: 0,
  idleTimer: null as any,
  dragDepth: 0,
  expLevels: new Set<string>(),
  expSubs: new Set<string>(),
  RAIL_INIT: false,
  sentSeen: new Set<string>(),
  pqItems: [] as Note[],
  pqIdx: 0,
  chatLog: [] as { who: 'you' | 'ai'; t: string }[],
  chatMeter: null as any,
  BUILD_DATE: 1789540763,
}
if (!S.settings) { S.settings = { ...DEF }; S.presets = { 'Default': { ...DEF } as Settings }; save(LS.pr, S.presets); save(LS.s, S.settings) }
if (!S.settings!.mode) S.settings!.mode = 'silent'
if (!S.settings!.ttspref) S.settings!.ttspref = 'auto'
  if (!S.settings!.elevenVoice || S.settings!.elevenVoice === 'JBFqnCBsd6RMkjVDRZzb') S.settings!.elevenVoice = 'Xb7hH8MSUJpSbSDYk0k2' // zh default: Alice (George stays for EN)
if (!localStorage.getItem('ast_modeflip')) { S.settings!.mode = 'voice'; localStorage.setItem('ast_modeflip', '1') }
/* auracle learn sequence: one user who never touched old default gets 1m 5m 1d (3 recalls → graduate next day) */
if (S.settings!.steps === '5s 50s 2m') S.settings!.steps = '1m 5m 1d'
if (S.settings!.relearn === '5s 50s 2m') S.settings!.relearn = '1m 5m 1d'
if (typeof S.counts.n === 'number' || typeof S.counts.r === 'number') S.counts = { d: S.counts.d, n: {}, r: {} }

export const $ = (id: string) => document.getElementById(id)!
export const esc = (s: any) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c as '&' | '<' | '>' | '"']!))
export const today = () => new Date().toISOString().slice(0, 10)

/* ---------- helpers ---------- */
export function rollCounts() {
  const t = today(); S.counts.s = S.counts.s || {}
  if (S.counts.d !== t) { S.counts = { d: t, n: {}, r: {}, s: {} }; save(LS.c, S.counts) }
}
export function pOf(id: string): Prog {
  if (!S.progress[id]) { S.progress[id] = { state: 'new', step: 0, due: 0, ivl: 0, ease: 2.5, lapses: 0 } }
  return S.progress[id]
}
export function persist() { save(LS.p, S.progress); save(LS.c, S.counts); sbQueue() }
export const isDue = (id: string) => {
  const p = S.progress[id]; if (!p) return false; if (p.state === 'new') return false
  if (p.state === 'learn' || p.state === 'relearn') return p.due <= Date.now()
  return p.due <= Date.now()
}
export const normPy = (s: string) => (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ü|v/g, 'u').replace(/[^a-z0-9]/g, '')
export const normHz = (s: string) => (s || '').replace(/[\s\u3000,.。!！?？;；:：、'"“”‘’（）()《》<>…—·]/g, '')
export function lev(a: string, b: string) {
  const m = Array.from({ length: a.length + 1 }).map((_, i) => [i, ...Array(b.length).fill(0)] as number[])
  for (let j = 0; j <= b.length; j++) m[0][j] = j
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] !== b[j - 1] ? 1 : 0))
  return m[a.length]![b.length]!
}
export function parseSteps(s: string): number[] {
  return (s || '').trim().split(/\s+/).filter(Boolean).map(x => {
    const m = x.match(/^([\d.]+)(s|m|h|d)?$/i); if (!m) return null as any
    const n = parseFloat(m[1]!), u = (m[2] || 's').toLowerCase()
    return n * (u === 's' ? 1 : u === 'm' ? 60 : u === 'h' ? 3600 : 86400)
  }).filter((x: number) => x != null && x > 0)
}
export function mult() { const r = Math.min(99, Math.max(80, +S.settings!.ret || 90)); return 1 + (100 - r) * 0.12 }
export const sHzHas = (n: Note) => !!(n.sHz || n.sMean)

export function countKey() {
  const d = String(S.studyDeck || ''); const L = S.levelFilter[d]
  return L == null ? d : d + ':' + L
}

/* ---------- curriculum ---------- */
export function lvlOk(deckId: string | number, n: Note) {
  const L = S.levelFilter[String(deckId)]
  return L == null || hskLevel(n) === L
}
export function liveNotes() {
  return S.notes.filter(n => S.decksOn[n.deckId] && !S.progress[n.id]?.leech && lvlOk(n.deckId, n))
}
export function lessons() { return liveNotes().filter(n => sHzHas(n))
  .sort((a, b) => (a.k || 0) - (b.k || 0) || (a.id < b.id ? -1 : 1)) }
export function hskLevel(n: Note) { const k = n.k || 0; return k <= 150 ? 1 : k <= 300 ? 2 : k <= 600 ? 3 : k <= 1200 ? 4 : k <= 2500 ? 5 : 6 }
export function levelComplete(lvl: number) { return lessons().filter(n => hskLevel(n) === lvl).every(n => S.progress['S' + n.id]) }
export function sentReady(n: Note) {
  if (!(n.sHz || n.sMean)) return false
  const Str = n.sHz || n.sMean; const seen = new Set<string>()
  for (const m of S.notes) { if (!m.hanzi || seen.has(m.hanzi)) continue; seen.add(m.hanzi)
    if (Str.includes(m.hanzi) && S.progress[m.id]?.state !== 'review') return false }
  return true
}
export function sentComplete(n: Note) {
  const p = S.progress[n.id]
  if (!(n.sHz || n.sMean)) return p?.state === 'review'
  if (!p || !p.sentDone) return false
  return sentReady(n) || p.skipped
}
export function activeNote(): Note | null {
  const c = S.notes.filter(n => S.decksOn[n.deckId] && lvlOk(n.deckId, n))
    .sort((a, b) => (a.k || 0) - (b.k || 0) || (a.id < b.id ? -1 : 1))
  for (const n of c) if (!sentComplete(n)) return n; return null
}

/* ---------- sentence helpers ---------- */
export function sentWords(n: Note) {
  const Str = n.sHz || ''; const seen = new Set<string>(); const out: Note[] = []
  const c = [...S.notes].sort((a, b) => (b.hanzi.length - a.hanzi.length))
  let rest = Str
  for (const m of notesOrder(c)) {
    if (!m.hanzi || m.hanzi.length < 2 || seen.has(m.hanzi)) continue
    if (rest.includes(m.hanzi)) { seen.add(m.hanzi); out.push(m); rest = rest.split(m.hanzi).join('') }
    if (!rest) break
  }
  return out
}
function notesOrder(c: Note[]) { return c }

/* ---------- wiring hook (set by lib/sync) ---------- */
let _sbQueue: () => void = () => {}
export function setSbQueue(f: () => void) { _sbQueue = f }
export function sbQueue() { _sbQueue() }

/* ---------- diag + misc ---------- */
export function diag(m: string) {
  S.diagLog.push(m); if (S.diagLog.length > 4) S.diagLog.shift()
  const d = $('diag'); if (d) d.textContent = S.diagLog.join(' | '); console.log('[diag]', m)
}
