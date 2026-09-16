"use strict"
import { S, LS, diag, esc, setSbQueue, load as loadLS, type Note } from './state'
import { sbPull, sbInit } from './sync'
import { renderHome, showHome, statsView } from './ui'
import { saveAll } from './idb'
import { sb } from './sync'

setSbQueue(onStateChange)
function onStateChange() {
  if (!S.sbUser) return
  clearTimeout(S.sbTimer); S.sbTimer = setTimeout(() => { sbPush().catch(() => {}) }, 2500)
}

/* bundled data are part of Aya itself — always loaded, cannot be hidden */
export async function loadBundled(): Promise<number> {
  try {
    let j: any = null, err: any = null
    const urls = ['data/mandarin.json?v=' + S.BUILD_DATE,
      'https://raw.githubusercontent.com/Raspberry05/mandarin-trainer/master/public/data/mandarin.json']
    for (let i = 0; i < urls.length && !j; i++) {
      try { diag('bundled: fetching ' + urls[i].split('?')[0]!.slice(0, 60))
        const r = await fetch(urls[i]!, { cache: 'no-store' }); if (!r.ok) throw new Error('http ' + r.status); j = await r.json() }
      catch (e) { err = e; j = null }
    }
    if (!j) { diag('bundled fetch failed: ' + err)
      document.getElementById('import-status')!.innerHTML = '⚠ bundled curricula failed to load (' + esc(String(err)) + ') — check connection or import an .apkg manually'; return 0 }
    let added = 0
    // migration: purge legacy per-file bundled ids (hsk15/hsk6) replaced by combined 'mz'
    const legacy = S.notes.filter(n => n.id.startsWith('bhsk15') || n.id.startsWith('bhsk6'))
    for (const n of legacy) { delete S.progress[n.id]; delete S.progress['S' + n.id] }
    if (legacy.length) S.notes = S.notes.filter(n => !legacy.includes(n))
    for (const n of j.notes) {
      if (S.notes.some((x: Note) => x.id === n.id)) continue
      const d = j.decks[n.d] || j.decks[0]
      if (!d) { diag('bundled: note deck missing, skipped'); continue }
      S.notes.push({ id: n.id, deckId: d.id, deck: d.name, lang: d.lang, desc: d.desc,
        hanzi: n.h, pinyin: n.p || '', meaning: n.m || '', k: n.k || 0,
        sHz: n.sh || '', sPy: n.sp || '', sMean: n.sm || '', sSound: '',
        img: n.img ? `data/img/${n.id}.webp` : '', sound: '' })
      added++
    }
    if (added || legacy.length) { S.sentSeen.clear(); await saveAll() }
    diag(`bundled: +${added} added, ${legacy.length} purged, notes=${S.notes.length}, mz-present=${S.notes.some(n => n.deckId === 'mz')}`)
    if (added) document.getElementById('import-status')!.innerHTML = `✅ bundled curriculum loaded: +${added} cards`
    return added
  } catch (e) { diag('bundled error: ' + e); return 0 }
}

export function snapshotState() { return { progress: S.progress, settings: S.settings, presets: S.presets, counts: S.counts, ts: Date.now() } }
export async function sbPush() {
  if (!S.sbUser) return
  try {
    await sb.from('user_state').upsert({ user_id: S.sbUser.id, data: snapshotState(), updated_at: new Date().toISOString() })
    localStorage.setItem(LS.lastmod, String(Date.now())); diag('sync: pushed')
  } catch (e) { diag('sync push: ' + e) }
}

