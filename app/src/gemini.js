// Google Gemini (free API key from aistudio.google.com) as the brain for the CEO and all 25 staff.
// Staff answers are structured JSON; when a staff member needs the web, Gemini researches with
// Google Search first and the answer is then shaped into the schema. The rails check everything after.

const API = 'https://generativelanguage.googleapis.com/v1beta/models'

// Our JSON schemas -> the subset Gemini accepts (no additionalProperties, upper-case types).
export function toGeminiSchema(s) {
  if (!s || typeof s !== 'object') return s
  const out = {}
  if (s.type) out.type = String(s.type).toUpperCase()
  if (s.description) out.description = s.description
  if (s.enum) out.enum = s.enum
  if (s.properties) out.properties = Object.fromEntries(Object.entries(s.properties).map(([k, v]) => [k, toGeminiSchema(v)]))
  if (s.required) out.required = s.required
  if (s.items) out.items = toGeminiSchema(s.items)
  return out
}

// Pull the first JSON object out of a text answer (models sometimes wrap it in ```json fences).
export function parseJSON(text) {
  const t = String(text || '').replace(/```(?:json)?/g, '')
  const start = t.indexOf('{'), end = t.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('no JSON in the answer')
  return JSON.parse(t.slice(start, end + 1))
}

export class GeminiBrain {
  constructor({ key = process.env.GEMINI_API_KEY, model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite', fetchImpl = fetch, timeoutMs = 40000 } = {}) {
    if (!key) throw new Error('GEMINI_API_KEY is not set')
    Object.assign(this, { key, model, fetchImpl, timeoutMs })
    this.fallbacks = (process.env.GEMINI_FALLBACKS || 'gemini-flash-lite-latest,gemini-3.8-flash,gemini-flash-latest').split(',').map(x => x.trim()).filter(Boolean)
    this.name = `gemini:${model}`
  }

  // Try the chosen model, then fall back through others when Google says a model is overloaded (503/500).
  async call(body) {
    let last
    for (const model of [this.model, ...this.fallbacks.filter(m => m !== this.model)]) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try { return await this.callModel(model, body) } catch (e) {
          if (e.name === 'TimeoutError' || /aborted/i.test(e.message)) { e = Object.assign(new Error(`Gemini ${model} timed out`), { retry: true }); attempt = 1 }
          last = e
          if (!e.retry) throw e
          await new Promise(r => setTimeout(r, 800 * (attempt + 1)))
        }
      }
    }
    throw last
  }

  async callModel(model, body) {
    const res = await this.fetchImpl(`${API}/${model}:generateContent`, {
      method: 'POST', signal: AbortSignal.timeout(this.timeoutMs),
      headers: { 'content-type': 'application/json', 'x-goog-api-key': this.key },
      body: JSON.stringify(body),
    })
    const data = await res.json().catch(() => ({}))
    if (res.status === 429) throw Object.assign(new Error(`Gemini free-tier limit reached on ${model}`), { retry: true })
    if (res.status === 404) throw Object.assign(new Error(`Gemini model ${model} is not available`), { retry: true })
    if (res.status >= 500) throw Object.assign(new Error(`Gemini ${model} is busy (${res.status})`), { retry: true })
    if (!res.ok) throw new Error(`Gemini error ${res.status}: ${data?.error?.message || 'unknown'}`)
    this.lastModel = model
    const cand = data.candidates?.[0]
    if (!cand?.content?.parts?.length) throw new Error(`Gemini gave no answer (${cand?.finishReason || data?.promptFeedback?.blockReason || 'empty'})`)
    return cand.content
  }

  text(content) { return (content.parts || []).map(p => p.text || '').join('') }

  // Same interface as ClaudeBrain: think({ system, prompt, schema, tools }) -> object matching schema.
  async think({ system, prompt, schema, tools = ['WebSearch'] }) {
    const systemInstruction = { parts: [{ text: system }] }
    if (tools && tools.length && !this.noSearch) {
      try { return await this.thinkWithSearch({ systemInstruction, prompt, schema }) } catch (e) {
        if (!/limit|quota|429/i.test(e.message)) throw e
        this.noSearch = true   // this key's free tier has no Google Search grounding: answer without it
      }
    }
    return this.thinkPlain({ systemInstruction, prompt: this.noSearch && tools?.length ? `${prompt}\n\n(You have no web access right now. Do not guess contact details: only include outreach if you know the exact page that prints the contact.)` : prompt, schema })
  }

  async thinkWithSearch({ systemInstruction, prompt, schema }) {
    {
      // 1. research with Google Search, answer in JSON text
      const research = await this.callModel(this.model, {
        systemInstruction, tools: [{ google_search: {} }],
        contents: [{ role: 'user', parts: [{ text: `${prompt}\n\nResearch with Google Search where it helps. Then reply with ONLY a JSON object matching this JSON schema (no other text):\n${JSON.stringify(schema)}` }] }],
      })
      const text = this.text(research)
      try { return parseJSON(text) } catch {
        // 2. shape the research into the schema
        const shaped = await this.call({
          systemInstruction,
          contents: [{ role: 'user', parts: [{ text: `Turn this work into the required JSON. Keep every fact, URL, email and phone exactly as written.\n\n${text}` }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema) },
        })
        return parseJSON(this.text(shaped))
      }
    }
  }

  async thinkPlain({ systemInstruction, prompt, schema }) {
    const out = await this.call({
      systemInstruction,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json', responseSchema: toGeminiSchema(schema) },
    })
    return parseJSON(this.text(out))
  }
}
