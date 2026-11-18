import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '../src/store.js'
import { Company } from '../src/company.js'
import { ScriptedBrain } from '../src/brain.js'
import { GeminiBrain, toGeminiSchema, parseJSON } from '../src/gemini.js'
import { CEO } from '../src/ceo.js'
import { STEP } from '../src/schemas.js'

// A fake Gemini endpoint: replies come from a queue; we record what was sent.
function fakeGemini(replies) {
  const sent = []
  const fetchImpl = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); const content = replies.shift(); return { ok: true, status: 200, json: async () => ({ candidates: [{ content }] }) } }
  return { sent, brain: new GeminiBrain({ key: 'test-key', fetchImpl }) }
}

test('schemas are converted to the subset Gemini accepts; JSON is pulled out of fenced answers', () => {
  const g = toGeminiSchema(STEP)
  assert.equal(g.type, 'OBJECT'); assert.equal(g.properties.outreach.items.properties.channel.type, 'STRING')
  assert.ok(!JSON.stringify(g).includes('additionalProperties'))
  assert.deepEqual(parseJSON('Sure!\n```json\n{"a": 1}\n```'), { a: 1 })
})

test('a staff step with web research: Google Search first, JSON back', async () => {
  const { sent, brain } = fakeGemini([{ parts: [{ text: '```json\n{"summary":"ok","status":"done","deliverable":"# x","handoffs":[],"requests":[],"outreach":[]}\n```' }] }])
  const out = await brain.think({ system: 's', prompt: 'p', schema: STEP, tools: ['WebSearch'] })
  assert.equal(out.summary, 'ok')
  assert.deepEqual(sent[0].body.tools, [{ google_search: {} }])
  assert.match(sent[0].url, /:generateContent$/)
})

test('the CEO calls tools, reads the results and answers; it has no way to approve money', async () => {
  const store = new Store(null)
  const staff = new ScriptedBrain(() => ({ summary: 'Planned.', tasks: [{ key: 't1', title: 'Find tea suppliers', detail: '', assignee: 'purchase', priority: 'urgent', after: [] }] }))
  const co = new Company({ store, brain: staff, fetchImpl: async () => ({ ok: false, status: 404 }) })
  const { sent, brain } = fakeGemini([
    { parts: [{ functionCall: { name: 'start_venture', args: { idea: 'Tea box for offices' } } }] },
    { parts: [{ text: 'Started V1 and planned it. Rehan is on suppliers (T1).' }] },
  ])
  const ceo = new CEO({ co, brain })
  const r = await ceo.chat('Start a tea box business for offices')
  assert.match(r.reply, /Started V1/)
  assert.deepEqual(r.actions.map(a => a.tool), ['start_venture'])
  assert.equal(store.tasks()[0].title, 'Find tea suppliers')
  const names = sent[0].body.tools[0].functionDeclarations.map(f => f.name)
  assert.ok(names.includes('assign_task') && names.includes('board_report'))
  assert.ok(!names.some(n => /approve|decide|pay|spend/.test(n)))
  assert.equal(sent[1].body.contents.at(-1).parts[0].functionResponse.name, 'start_venture')
})

test('without a Gemini key the CEO still understands simple commands', async () => {
  const store = new Store(null)
  const co = new Company({ store, brain: new ScriptedBrain(() => ({ summary: 'Plan.', tasks: [{ key: 't1', title: 'Price the box', detail: '', assignee: 'cfo', priority: 'normal', after: [] }] })) })
  const ceo = new CEO({ co, brain: co.brain })
  assert.match((await ceo.chat('start a tea box for offices')).reply, /Started V1/)
  assert.match((await ceo.chat('status')).reply, /V1/)
  assert.match((await ceo.chat('hello')).reply, /start <idea>/)
})
