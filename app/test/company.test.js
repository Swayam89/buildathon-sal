import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Store } from '../src/store.js'
import { Company } from '../src/company.js'
import { ScriptedBrain } from '../src/brain.js'

const PAGES = {
  'https://hillside-tea.example/contact': '<h1>Hillside Tea Estate</h1><p>Wholesale: <a href="mailto:orders@hillside-tea.example">orders@hillside-tea.example</a>, +91 98765 43210</p>',
}
const fetchImpl = async (url) => PAGES[url] ? { ok: true, status: 200, text: async () => PAGES[url] } : { ok: false, status: 404 }

const step = (over = {}) => ({ summary: 'Did it.', status: 'done', deliverable: '# Notes\nDone.', handoffs: [], requests: [], outreach: [], ...over })
const make = (answers) => {
  let t = 1_800_000_000_000
  const store = new Store(null, { now: () => (t += 1000) })
  return { store, co: new Company({ store, brain: new ScriptedBrain(answers), fetchImpl }) }
}

test('the chief of staff turns an idea into a task graph with dependencies', async () => {
  const { store, co } = make([{ summary: 'Sell a monthly tea box.', tasks: [
    { key: 't1', title: 'Find tea suppliers', detail: '3 estates', assignee: 'purchase', priority: 'urgent', after: [] },
    { key: 't2', title: 'Price the box', detail: 'cost + margin', assignee: 'cfo', priority: 'normal', after: ['t1'] },
    { key: 't3', title: 'Hire a magician', detail: '', assignee: 'wizard', priority: 'low', after: [] },
  ] }])
  const v = co.startVenture({ idea: 'Assam tea subscription box' })
  const p = await co.plan(v.id)
  assert.equal(p.tasks.filter(r => r.ok).length, 2)
  assert.match(p.tasks[2].reason, /no one called "wizard"/)
  const [t1, t2] = store.tasks({ venture: v.id })
  assert.deepEqual(t2.deps, [t1.id])
  assert.deepEqual(co.runnable().map(t => t.id), [t1.id]) // t2 waits for t1
  assert.equal(store.data.events.filter(e => e.type === 'rail').length, 1)
})

test('a step does the work, hands off, asks for money and drafts only verified outreach', async () => {
  const { store, co } = make([step({
    summary: 'Found two estates.',
    handoffs: [{ title: 'Negotiate wholesale price', detail: 'Ask for 10 kg rates', assignee: 'deals' }, { title: 'Find tea suppliers again', detail: '', assignee: 'purchase' }],
    requests: [{ kind: 'spend', amount_inr: 1200, payee: 'Hillside Tea Estate', reason: 'Sample pack of 4 teas' }],
    outreach: [
      { channel: 'email', to_name: 'Hillside Tea Estate', email: 'orders@hillside-tea.example', phone: '', source_url: 'https://hillside-tea.example/contact', subject: 'Wholesale rates', body: 'Hi, could you share your wholesale price list?' },
      { channel: 'email', to_name: 'Hillside Tea Estate', email: 'ceo@hillside-tea.example', phone: '', source_url: 'https://hillside-tea.example/contact', subject: 'Hi', body: 'Hello!' },
      { channel: 'email', to_name: 'Hillside Tea Estate', email: 'orders@hillside-tea.example', phone: '', source_url: 'https://hillside-tea.example/contact', subject: 'Order', body: 'We will pay the advance payment today.' },
    ],
  })])
  const v = co.startVenture({ idea: 'Tea box' })
  const t = co.addTask({ venture: v.id, title: 'Find tea suppliers', assignee: 'purchase' }).task
  const r = await co.step()
  assert.equal(r.ok, true)
  assert.equal(store.task(t.id).status, 'done')
  assert.equal(r.handoffs.length, 1)                // the near-duplicate was dropped
  assert.match(r.handoffs_dropped[0], /duplicate of T1/)
  assert.equal(store.task(r.handoffs[0]).parent, t.id)
  assert.equal(store.data.requests[0].amount_inr, 1200)
  assert.equal(r.outreach.length, 1)                // only the verified, non-committing one
  assert.match(r.outreach_blocked[0], /ceo@hillside-tea.example is not on/)
  assert.match(r.outreach_blocked[1], /commits money/)
  const m = store.data.messages[0]
  assert.equal(m.status, 'draft')
  assert.match(m.body, /Reyansh is an AI assistant|is an AI assistant at Corporate AI/)
  assert.match(co.report(v.id), /Needs your decision \(1\)[\s\S]*₹1200 to Hillside Tea Estate/)
})

test('a failing brain retries once, then marks the task failed; the owner decides requests', async () => {
  const { store, co } = make([new Error('timeout'), new Error('timeout')])
  const v = co.startVenture({ idea: 'Tea box' })
  co.addTask({ venture: v.id, title: 'Write a tagline', assignee: 'content' })
  assert.equal((await co.step()).ok, false)
  assert.equal(store.tasks()[0].status, 'todo')
  await co.step()
  assert.equal(store.tasks()[0].status, 'failed')
  const req = store.addRequest({ venture: v.id, task: 'T1', by: 'cfo', kind: 'spend', amount_inr: 500, payee: 'X', reason: 'y' })
  assert.equal(co.decide(req.id, { approve: false, note: 'too early' }).request.status, 'declined')
  assert.equal(co.decide(req.id, { approve: true }).ok, false) // already decided
})

test('the daily step cap holds', async () => {
  const { co } = make(() => step())
  co.stepsPerDay = 1
  const v = co.startVenture({ idea: 'Tea box' })
  co.addTask({ venture: v.id, title: 'Tagline ideas', assignee: 'content' })
  co.addTask({ venture: v.id, title: 'Instagram plan', assignee: 'growth' })
  assert.equal((await co.step()).ok, true)
  assert.match((await co.step()).reason, /daily cap/)
})
