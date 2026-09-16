import { NextRequest } from 'next/server'

/* server-side TTS proxy: keys stay in server env (ELEVENLABS_API_KEY / OPENAI_API_KEY) */
export async function POST(req: NextRequest) {
  let b: any
  try { b = await req.json() } catch (e) { return new Response('bad json', { status: 400 }) }
  const text = String(b?.text || '')
  const lang = String(b?.lang || 'zh-CN')
  const engine = String(b?.engine || '')
  if (!text || text.length > 600) return new Response('bad text', { status: 400 })

  if (engine === 'eleven') {
    const key = process.env.ELEVENLABS_API_KEY
    if (!key) return new Response('ELEVENLABS_API_KEY not configured', { status: 501 })
    const voice = String(b?.voice || 'JBFqnCBsd6RMkjVDRZzb')
    const model = lang.startsWith('zh') ? 'eleven_multilingual_v2' : 'eleven_flash_v2_5'
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voice)}?output_format=mp3_44100_128`,
      { method: 'POST', headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, model_id: model }) })
    if (!r.ok) return new Response('upstream ' + r.status, { status: 502 })
    return new Response(r.body, { status: 200, headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400' } })
  }

  if (engine === 'openai') {
    const key = process.env.OPENAI_API_KEY
    if (!key) return new Response('OPENAI_API_KEY not configured', { status: 501 })
    const r = await fetch('https://api.openai.com/v1/audio/speech',
      { method: 'POST', headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: String(b?.voice || 'coral'), input: text, response_format: 'mp3',
          instructions: lang.startsWith('zh') ? 'Speak warm, clear native Mandarin, moderate pace.' : 'Speak warmly, like a friendly tutor.' }) })
    if (!r.ok) return new Response('upstream ' + r.status, { status: 502 })
    return new Response(r.body, { status: 200, headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400' } })
  }

  return new Response('unknown engine', { status: 400 })
}
