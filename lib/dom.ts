"use strict"
/* shared DOM helpers used by every view/session module — no study logic here */
import { $ } from './state'

/* inline SVG icon set — animated via globals.css keyframes (ic-float/ic-eq/etc.) */
export const I = {
  check: (c = '#00e676') => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5 9.5 18 20 6.5"/></svg>`,
  x: (c = '#ff3d71') => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="3.4" stroke-linecap="round"><path d="M6 6 18 18M18 6 6 18"/></svg>`,
  spk: (c = '#00c2ff') => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none"><path d="M3 9v6h4l5 4V5L7 9H3z" fill="${c}"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" stroke="${c}" stroke-width="2" stroke-linecap="round"/></svg>`,
  play: (c = '#00e676') => `<svg width="15" height="15" viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" fill="${c}"/></svg>`,
  pause: (c = '#ffb300') => `<svg width="15" height="15" viewBox="0 0 24 24"><rect x="5" y="4" width="5" height="16" rx="2" fill="${c}"/><rect x="14" y="4" width="5" height="16" rx="2" fill="${c}"/></svg>`,
  skip: (c = '#ffb300') => `<svg width="16" height="16" viewBox="0 0 24 24" fill="${c}"><path d="M5 5v14l11-7z"/><rect x="17" y="5" width="3.4" height="14" rx="1.7"/></svg>`,
  mic: (c = '#00c2ff') => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"><rect x="9" y="2.5" width="6" height="11" rx="3" fill="${c}" stroke="none"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>`,
  eye: (c = '#ffb300') => `<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2"><path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="${c}" stroke="none"/></svg>`,
  reset: (c = '#ffb300') => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.4" stroke-linecap="round"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5" stroke-linejoin="round"/></svg>`,
  books: () => `<svg width="17" height="17" viewBox="0 0 24 24"><rect x="3" y="4.5" width="13" height="4.2" rx="1.6" fill="#00c2ff"/><rect x="5.5" y="10" width="15" height="4.2" rx="1.6" fill="#b249ff"/><rect x="3" y="15.5" width="11" height="4.2" rx="1.6" fill="#ff4b8b"/></svg>`,
  target: () => `<svg width="30" height="30" viewBox="0 0 24 24" fill="none"><circle class="ring" cx="12" cy="12" r="9" stroke="#00c2ff" stroke-width="2.4"/><circle class="ring" cx="12" cy="12" r="4.5" stroke="#b249ff" stroke-width="2.4" style="animation-direction:reverse"/><circle class="dot" cx="12" cy="12" r="1.8" fill="#ff4b8b"/></svg>`,
  bubble: () => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none"><rect x="3" y="4.5" width="18" height="13" rx="5.5" stroke="#00c2ff" stroke-width="2.4"/><rect class="eq" x="8.4" y="9.2" width="2.1" height="4.2" rx="1" fill="#00e676"/><rect class="eq" x="11.6" y="7.6" width="2.1" height="7.4" rx="1" fill="#b249ff"/><rect class="eq" x="14.8" y="9.2" width="2.1" height="4.2" rx="1" fill="#ff4b8b"/></svg>`,
  gear: () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1"/></svg>`,
  user: () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/></svg>`,
  up: () => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V6M6 12l6-6 6 6"/></svg>`,
  box: (c = '#00c2ff') => `<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2"><path d="M12 3 3.5 7.2v9.6L12 21l8.5-4.2V7.2z" fill="rgba(0,194,255,.08)"/><path d="M3.5 7.2 12 11.5l8.5-4.3M12 11.5v9.3"/></svg>`,
  cards: (c = '#00c2ff') => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2"><rect x="3" y="6" width="13" height="13" rx="3"/><path d="M7.5 3h11a2.5 2.5 0 0 1 2.5 2.5v10.5" stroke-linecap="round"/></svg>`,
  chat: (c = '#b249ff') => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H9l-5 4.5z"/></svg>`,
}

export function btn(label: string, cls?: string, fn?: () => void, key?: string) {
  const b = document.createElement('button')
  if (label.startsWith('<svg')) { b.innerHTML = `<span class="bic">${label}</span>` }
  else { b.textContent = label }
  if (cls) b.className = cls; if (key) b.dataset.key = key; b.onclick = fn!; return b
}
export function setActions(...bs: (HTMLButtonElement | null)[]) {
  const a = $('actions')!; a.innerHTML = ''; bs.filter(Boolean).forEach(b => a.appendChild(b!))
}
/* raw prompt set — callers that need the top bar refreshed wrap this (ui.setPrompt) */
export function promptSet(html: string) { $('prompt')!.innerHTML = html }
export function promptAppend(html: string) { $('prompt')!.innerHTML += html }
export function fbClear() { const f = $('feedback')!; f.textContent = ''; f.className = '' }
