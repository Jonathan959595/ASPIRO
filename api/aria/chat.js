import { instructionsFor, jsonResponse, parseRequestBody, rejectOrigin, requireMethod, unavailable } from '../../server/aria/shared.js'

export default async function handler(request, response) {
  if (!requireMethod(request, response, 'POST') || rejectOrigin(request, response)) return
  if (!process.env.OPENAI_API_KEY) return unavailable(response)

  const payload = parseRequestBody(request)
  if (!payload || typeof payload.message !== 'string' || !payload.message.trim() || payload.message.length > 2000) {
    return jsonResponse(response, 400, { error: 'Enter a question of up to 2,000 characters.' })
  }

  let instructions
  try {
    instructions = instructionsFor(payload.context)
  } catch {
    return jsonResponse(response, 413, { error: 'Current lab context is too large.' })
  }

  const history = Array.isArray(payload.history) ? payload.history.slice(-10) : []
  const input = history
    .filter(item => item && (item.role === 'user' || item.role === 'assistant') && typeof item.text === 'string')
    .map(item => ({ role: item.role, content: item.text.slice(0, 2000) }))
  input.push({ role: 'user', content: payload.message.trim() })

  try {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_TEXT_MODEL || 'gpt-4.1-mini',
        instructions,
        input,
        max_output_tokens: 300,
      }),
      signal: AbortSignal.timeout(30_000),
    })
    const result = await upstream.json()
    if (!upstream.ok) {
      console.error('ARIA text response request failed with status', upstream.status)
      return jsonResponse(response, 502, { error: 'ARIA is temporarily unavailable. The built-in guide is still here.' })
    }
    const text = typeof result.output_text === 'string'
      ? result.output_text
      : result.output?.flatMap(item => item.content ?? []).find(item => item.type === 'output_text')?.text
    if (typeof text !== 'string' || !text.trim()) {
      console.error('ARIA text response returned no output text')
      return jsonResponse(response, 502, { error: 'ARIA could not form a response. Please try again.' })
    }
    return jsonResponse(response, 200, { text: text.trim() })
  } catch (error) {
    console.error('ARIA text response request failed:', error instanceof Error ? error.name : 'UnknownError')
    return jsonResponse(response, 502, { error: 'ARIA is temporarily unavailable. The built-in guide is still here.' })
  }
}
