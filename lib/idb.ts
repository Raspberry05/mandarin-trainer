"use strict"
/* ---------- IndexedDB persistence (local, like Anki's col.db) ---------- */
import { S } from './state'

let idbP: Promise<IDBDatabase> | null = null
function idb() {
  if (!idbP) idbP = new Promise((res, rej) => {
    const r = indexedDB.open('ast-store', 2)
    r.onupgradeneeded = () => { const d = r.result
      if (!d.objectStoreNames.contains('notes')) d.createObjectStore('notes')
      if (!d.objectStoreNames.contains('media')) d.createObjectStore('media')
      if (!d.objectStoreNames.contains('tts')) d.createObjectStore('tts') }
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error)
  })
  return idbP
}
/* TTS audio cache: persist premium AI voices so free credits aren't re-burned */
export async function getTts(k: string): Promise<Blob | null> { try {
  const db = await idb()
  return await new Promise(res => { const r = db.transaction('tts', 'readonly').objectStore('tts').get(k)
    r.onsuccess = () => res((r.result as Blob) || null); r.onerror = () => res(null) })
} catch (e) { return null } }
export async function putTts(k: string, blob: Blob) { try {
  const db = await idb()
  await new Promise((res, rej) => { const t = db.transaction('tts', 'readwrite'); t.objectStore('tts').put(blob, k)
    t.oncomplete = () => res(null); t.onerror = () => rej(t.error) })
} catch (e) {} }
export async function saveAll() { try {
  if (typeof navigator !== 'undefined' && navigator.storage && navigator.storage.persist) navigator.storage.persist()
  const db = await idb()
  await new Promise((res, rej) => { const t = db.transaction('notes', 'readwrite'); const st = t.objectStore('notes')
    st.clear(); st.put(S.notes, 'all'); t.oncomplete = () => res(null); t.onerror = () => rej(t.error) })
  await new Promise((res, rej) => { const t = db.transaction('media', 'readwrite'); const st = t.objectStore('media'); st.clear()
    for (const [name, blob] of Object.entries(S.mediaBlobs)) st.put(blob, name)
    t.oncomplete = () => res(null); t.onerror = () => rej(t.error) })
} catch (e) {} }

export async function loadStored(): Promise<boolean> { try {
  const db = await Promise.race([idb(),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('idb open timeout')), 4000))])
  const arr = await new Promise<any[]>(res => { const t = db.transaction('notes', 'readonly')
    const r = t.objectStore('notes').get('all'); r.onsuccess = () => res(r.result || []); r.onerror = () => res([]) })
  if (!arr.length) return false
  S.notes = arr
  await new Promise(res => { const t = db.transaction('media', 'readonly')
    const rq = t.objectStore('media').openCursor()
    rq.onsuccess = () => { const c = rq.result; if (c) { S.mediaMap[String(c.key).toLowerCase()] = URL.createObjectURL(c.value); c.continue() } else res(null) }
    rq.onerror = () => res(null) })
  S.notes.forEach(n => { n.deckId = String(n.deckId); if (!(n.deckId in S.decksOn)) S.decksOn[n.deckId] = true })
  return true
} catch (e) { return false } }
