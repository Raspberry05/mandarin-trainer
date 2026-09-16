"use strict"
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { S, diag } from './state'
import { SB_URL, SB_KEY } from './config'

export let sb: SupabaseClient

try { sb = createClient(SB_URL, SB_KEY) } catch (e) { diag('supabase init: ' + e) }

export async function sbPull() {
  if (!S.sbUser) return
  try {
    const { data, error } = await sb.from('user_state').select('data,updated_at').eq('user_id', S.sbUser.id).maybeSingle()
    if (error || !data || !data.data) { return }
    const cloudTs = Date.parse(data.updated_at), localTs = Number(localStorage.getItem('ast_lastmod') || 0)
    if (cloudTs > localTs && data.data) {
      S.progress = data.data.progress || {}
      if (data.data.settings) S.settings = { ...S.settings, ...data.data.settings }
      if (data.data.presets) S.presets = data.data.presets
      if (data.data.counts) S.counts = data.data.counts
      localStorage.setItem('ast_progress', JSON.stringify(S.progress))
      localStorage.setItem('ast_settings', JSON.stringify(S.settings))
      localStorage.setItem('ast_presets', JSON.stringify(S.presets))
      localStorage.setItem('ast_counts', JSON.stringify(S.counts))
      diag('sync: restored cloud (' + new Date(cloudTs).toISOString() + ')')
    }
  } catch (e) { diag('sync pull: ' + e) }
}

export async function sbInit() {
  if (!sb) return
  try { const { data: { session } } = await sb.auth.getSession()
    if (session?.user) { S.sbUser = session.user; sbBtnLabel(); sbPull() } } catch (e) {}
}

export function sbBtnLabel() { const b = document.getElementById('auth-btn'); if (!b) return
  b.textContent = S.sbUser ? '⬥ ' + String(S.sbUser.email || '').split('@')[0] : '👤 Sign in' }
