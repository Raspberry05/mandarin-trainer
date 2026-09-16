"use strict"
import { S, LS, load, persist } from './state'
import { saveAll } from './idb'
import { renderHome, showHome } from './ui'

export async function removeDeck(dRaw: string, dname: string) {
  const d = String(dRaw)
  if (d === 'mz') { alert('The Mandarin curriculum is built into Language Trainer and cannot be removed.'); return }
  const ns = S.notes.filter(n => String(n.deckId) === d)
  if (!confirm(`Remove deck "${dname}" — all ${ns.length} cards and their progress?`)) return
  if (!ns.length) { alert('No cards found for this deck.'); return }
  for (const n of ns) { delete S.progress[n.id]; delete S.progress['S' + n.id] }
  S.notes = S.notes.filter(n => String(n.deckId) !== d)
  const off = load(LS.bdo, [] as string[])
  if (!off.includes(d)) { off.push(d); localStorage.setItem(LS.bdo, JSON.stringify(off)) }
  if (S.studyDeck === d) { S.studyDeck = null; showHome(); return }
  await saveAll(); renderHome()
}

export function resetDeck(dRaw: string) {
  const d = String(dRaw); const ns = S.notes.filter(n => String(n.deckId) === d)
  if (!confirm(`Reset ALL progress for "${d}" (${ns.length} cards)? Lessons start over.`)) return
  for (const n of ns) { delete S.progress[n.id]; delete S.progress['S' + n.id] }
  S.counts.n[d] = 0; S.counts.r[d] = 0; S.counts.s = S.counts.s || {}; S.counts.s[d] = 0
  persist(); saveAll(); S.sentSeen.clear(); renderHome()
}
