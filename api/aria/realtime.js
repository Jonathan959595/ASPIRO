import { instructionsFor, jsonResponse, parseRequestBody, rejectOrigin, requireMethod, unavailable } from '../../server/aria/shared.js'

export default async function handler(request, response) {
  if (!requireMethod(request, response, 'POST') || rejectOrigin(request, response)) return
  if (!process.env.OPENAI_API_KEY) return unavailable(response)

  const payload = parseRequestBody(request)
  if (!payload || typeof payload.sdp !== 'string' || payload.sdp.length < 20 || payload.sdp.length > 120_000) {
    return jsonResponse(response, 400, { error: 'A valid WebRTC offer is required.' })
  }

  let instructions
  try {
    instructions = instructionsFor(payload.context)
  } catch {
    return jsonResponse(response, 413, { error: 'Current lab context is too large.' })
  }

  try {
    const form = new FormData()
    form.set('sdp', payload.sdp)
    form.set('session', JSON.stringify({
      type: 'realtime',
      model: process.env.OPENAI_REALTIME_MODEL || 'gpt-realtime-2.1',
      instructions,
      output_modalities: ['audio', 'text'],
      audio: {
        input: {
          transcription: { model: 'gpt-4o-mini-transcribe' },
          turn_detection: { type: 'semantic_vad' },
        },
        output: { voice: process.env.OPENAI_REALTIME_VOICE || 'marin' },
      },
    }))
    const upstream = await fetch('https://api.openai.com/v1/realtime/calls', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      body: form,
      signal: AbortSignal.timeout(45_000),
    })
    const answer = await upstream.text()
    if (!upstream.ok) {
      console.error('ARIA realtime session request failed with status', upstream.status)
      return jsonResponse(response, 502, { error: 'ARIA could not connect right now. Text and the Quantum Lab remain available.' })
    }
    response.statusCode = 201
    response.setHeader('Content-Type', 'application/sdp')
    response.setHeader('Cache-Control', 'no-store')
    response.end(answer)
  } catch (error) {
    console.error('ARIA realtime session request failed:', error instanceof Error ? error.name : 'UnknownError')
    return jsonResponse(response, 502, { error: 'ARIA could not connect right now. Text and the Quantum Lab remain available.' })
  }
}
