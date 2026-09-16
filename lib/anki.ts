"use strict"
import initSqlJs from 'sql.js'
import JSZip from 'jszip'
import * as fzstd from 'fzstd'
import { S as _S, type Note } from './state'

/* ---------- import ---------- */
let SQLP: Promise<any> | null = null
function getSQL() {
  if (!SQLP) SQLP = initSqlJs({ locateFile: (f: string) => `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${f}` })
  return SQLP
}
function clean(s: string) {
  return (s || '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\[sound:[^\]]+\]/g, '').trim()
}

const MIME: Record<string, string> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', m4b: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', webm: 'audio/webm',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif' }

export { clean }

export async function importApkg(file: File, onProg: (t: string) => void) {
  const zip = await JSZip.loadAsync(file)
  const mf = zip.file('media')
  const mediaInfo = JSON.parse((mf ? await mf.async('string') : '{}') || '{}')
  const entries = Object.entries(mediaInfo as Record<string, string>); let mi = 0
  for (const [num, fname] of entries) {
    const f = zip.file(num)
    if (f) try {
      const buf = await f.async('arraybuffer')
      const ext = ((fname.match(/\.([a-z0-9]+)$/i)) || [])[1] || 'mp3'
      const mime = MIME[String(ext).toLowerCase()] as string || 'application/octet-stream'
      S.mediaMap[String(fname).toLowerCase()] = URL.createObjectURL(new Blob([buf], { type: mime }))
      S.mediaBlobs[String(fname).toLowerCase()] = new Blob([buf], { type: mime })
    } catch (e) {}
    if (++mi % 25 === 0 && onProg) onProg(`extracting media ${mi}/${entries.length}`)
  }
  const dbFile = zip.file('collection.anki21') || zip.file('collection.anki21b') || zip.file('collection.anki23') || zip.file('collection.anki2')
  if (!dbFile) { const names = Object.keys(zip.files).slice(0, 10).join(', ')
    throw new Error('no collection database found (zip entries: ' + names + ')') }
  const SQL = await getSQL()
  let dbBytes: Uint8Array = await dbFile.async('uint8array')
  if (/anki21b$|anki23$/.test(dbFile.name)) {
    try { dbBytes = fzstd.decompress(dbBytes) } catch (z: any) { throw new Error('zstd decompress failed: ' + z.message) }
  }
  if (onProg) onProg('parsing collection database…')
  const db = new SQL.Database(dbBytes)
  const models: Record<string, any> = {}; const decks: Record<string, any> = {}
  const tabs = (db.exec("SELECT name FROM sqlite_master WHERE type='table'")[0]?.values.map((v: any[]) => v[0]) as unknown[] as string[]) || []
  const scan = (t: string) => { let res: any; try { res = db.exec(`SELECT * FROM "${t}"`) } catch (e) { return [] as any[] }
    const out: any[] = []; for (const row of (res[0]?.values || [])) for (const cell of row) {
      if (typeof cell === 'string' && cell.trim().startsWith('{')) {
        try { const o = JSON.parse(cell); if (o && o.name != null) out.push(o) } catch (e) {} } }
    return out }
  if (tabs.includes('models') || tabs.includes('notetypes')) {
    scan('models').concat(scan('notetypes')).forEach(m => { if (m.flds) models[m.id] = m })
    scan('decks').forEach(d => { if (d.id != null) decks[d.id] = d })
  } else {
    const norm = (o: any) => Array.isArray(o) ? o : Object.values(o || {})
    const c = db.exec('SELECT models,decks FROM col')[0]!.values[0]!
    ;(norm(JSON.parse(c[0] as string)) as any[]).forEach(m => models[m.id] = m);
    ;(norm(JSON.parse(c[1] as string)) as any[]).forEach(d => decks[d.id] = d) }
  const q = db.exec('SELECT id,mid,flds FROM notes')
  const deckOf: Record<string, string> = {}
  try { db.exec('SELECT nid,did FROM cards')[0]!.values.forEach(([nid, did]: any[]) => { if (!(nid in deckOf)) deckOf[nid] = String(did) }) } catch (e) {}
  const out: Note[] = []; const modelReport: Record<string, any> = {}; let lastProg = 0
  for (const [id, mid, flds] of (q[0]?.values || []) as [string, string, string][]) {
    const m = models[mid]; if (!m) continue
    if (onProg && out.length - lastProg >= 200) { lastProg = out.length; onProg(`parsing notes ${out.length}…`) }
    const rawVals = String(flds).split('')
    const vals = rawVals.map(clean)
    const names = (m.flds as { name: string }[]).map(f => f.name.toLowerCase())
    const idx = (re: RegExp, fb: number) => { const i = names.findIndex(n => re.test(n)); return i >= 0 ? i : fb }
    const ih = idx(/hanzi|simpl|trad|character|chinese|字|词/, 0)
    const ip = idx(/pinyin|roman|pron|py\b/, 1)
    const im = idx(/english|meaning|transl|definition|gloss|sense/, 2)
    const ia = names.findIndex(n => /audio|sound|语音|录音|说话/.test(n))
    const ish = idx(/sentencesimpl/, 10)
    const isp = idx(/sentencepinyin/, 14)
    const ism = idx(/sentencemeaning/, 16)
    const iss = names.findIndex(n => /sent(ence)?[\s_-]*audio/.test(n))
    const sSound = iss >= 0 ? (rawVals[iss]!.match(/\[sound:([^\]]+)\]/i) || [])[1] : null
    if (!modelReport[mid]) modelReport[mid] = { model: m.name, hanzi: names[ih] || `#${ih}`, pinyin: names[ip] || `#${ip}`, meaning: names[im] || `#${im}`, audio: names[ia] || null, used: false }
    modelReport[mid]!.used = true
    const sfld = vals[m.sortf || 0] || ''
    const audioIdxs = names.map((_, i) => i).filter(i => /\[sound:([^\]]+)\]/i.test(rawVals[i] || ''))
    const sIdx = (ia >= 0 && audioIdxs.includes(ia)) ? ia : (audioIdxs[0] ?? -1)
    const sound = sIdx >= 0 ? (rawVals[sIdx]!.match(/\[sound:([^\]]+)\]/i) || [])[1] : null
    const imgM = String(flds).match(/<img[^>]+src=["']?([^"'>\s]+)/i)
    let img = imgM ? imgM[1]! : null
    if (img) { try { img = decodeURIComponent(img) } catch (e) {} }
    out.push({ id: 'a' + id, deckId: String(deckOf[id] ?? mid), deck: (decks[deckOf[id]]?.name) || m.name,
      desc: (decks[deckOf[id]]?.desc) || '', hanzi: vals[ih] || sfld, pinyin: vals[ip] || '', meaning: vals[im] || '', sound, img,
      sHz: vals[ish] || '', sPy: vals[isp] || '', sMean: vals[ism] || '', sSound, k: parseInt(vals[0] as string) || 0 })
  }
  db.close(); return { notes: out, report: modelReport }
}

export function importTsv(text: string, fname: string) {
  const out: Note[] = []; const lines = text.split(/\r?\n/).filter(l => l.trim())
  for (const [i, line] of lines.entries()) {
    const cols = line.split('\t').map(clean).filter(Boolean)
    if (cols.length < 2) { const c2 = line.split(/;|,/).map(clean); if (c2.length >= 2) cols.push(...c2) }
    let [hanzi, pinyin, meaning] = cols as [string?, string?, string?]
    if (!hanzi || !meaning) { if (hanzi && pinyin) { meaning = pinyin; pinyin = '' } else continue }
    out.push({ id: 't' + fname + i, deckId: 'tsv-' + fname, deck: fname, hanzi: hanzi!, pinyin: pinyin || '', meaning: meaning!, sound: null, img: null, sHz: '', sPy: '', sMean: '', sSound: null, k: 0 })
  }
  return out
}

import { S } from './state'
