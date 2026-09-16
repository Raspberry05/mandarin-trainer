import { NextRequest } from 'next/server'

/* ElevenLabs Scribe speech-to-text proxy: audio blob in, {text} out.
   Key stays server-side (ELEVENLABS_API_KEY). Scribe auto-detects language. */
export async function POST(req: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return new Response('ELEVENLABS_API_KEY not configured', { status: 501 })
  try {
    const audio = await req.blob()
    if (!audio || audio.size < 1200) return new Response('no audio', { status: 400 })
    if (audio.size > 20 * 1024 * 1024) return new Response('audio too large', { status: 400 })
    const form = new FormData()
    form.append('file', audio, audio.type?.includes('mp3') ? 'audio.mp3' : 'audio.webm')
    form.append('model_id', 'scribe_v1')
    form.append('language_code', 'cmn') // Mandarin practice — pin the language, auto-detect misfires on short clips
    const r = await fetch('https://api.elevenlabs.io/v1/speech-to-text', { method: 'POST', headers: { 'xi-api-key': key }, body: form })
    if (!r.ok) return new Response('upstream ' + r.status + ': ' + (await r.text()).slice(0, 200), { status: 502 })
    const j = await r.json()
    return Response.json({ text: String(j.text || '').trim(), language: j.language_code || '' })
  } catch (e: any) { return new Response('stt error: ' + e.message, { status: 500 }) }
}
