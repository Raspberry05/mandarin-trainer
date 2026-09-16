"use strict"
/* shared DOM helpers used by every view/session module — no study logic here */
import { $ } from './state'

export function btn(label: string, cls?: string, fn?: () => void, key?: string) {
  const b = document.createElement('button')
  b.textContent = label; if (cls) b.className = cls; if (key) b.dataset.key = key; b.onclick = fn!; return b
}
export function setActions(...bs: (HTMLButtonElement | null)[]) {
  const a = $('actions')!; a.innerHTML = ''; bs.filter(Boolean).forEach(b => a.appendChild(b!))
}
/* raw prompt set — callers that need the top bar refreshed wrap this (ui.setPrompt) */
export function promptSet(html: string) { $('prompt')!.innerHTML = html }
export function promptAppend(html: string) { $('prompt')!.innerHTML += html }
export function fbClear() { const f = $('feedback')!; f.textContent = ''; f.className = '' }
