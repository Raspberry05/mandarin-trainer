import { NextRequest } from 'next/server'

/* conversational mode: LLM chat proxy — OPENAI_API_KEY stays server-side */
export async function POST(req: NextRequest) {
  if (!process.env.OPENAI_API_KEY) return new Response('OPENAI_API_KEY not configured', { status: 501 })
  let b: any
  try { b = await req.json() } catch (e) { return new Response('bad json', { status: 400 }) }
  const msgs = Array.isArray(b?.msgs) ? b.msgs.slice(-12) : []
  try {
    const r = await fetch('https://api.openai.com/v1/chat/completions',
      { method: 'POST', headers: { 'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 120,
          messages: [
            { role: 'system', content: 'You are a friendly Mandarin conversation partner for a learner. Reply ONLY in simple, natural spoken Mandarin — no English except pinyin in parentheses after each sentence. Keep replies under 2 short sentences and always ask a simple question back. Everyday topics only: food, school, work, weather, hobbies, family, plans.' },
            ...msgs.map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') })),
          ] }) })
    if (!r.ok) return new Response('upstream ' + r.status, { status: 502 })
    const j = await r.json()
    return Response.json({ reply: j.choices?.[0]?.message?.content || '好的！' })
  } catch (e: any) { return new Response('upstream error', { status: 502 }) }
}
