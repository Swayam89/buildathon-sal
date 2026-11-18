// Run the whole company once in the terminal: start the demo venture, let the chief of staff plan it,
// let staff work until the queue is empty, then print the board report.
//   node demo/run.js            offline (scripted brain, fake pages), about 1 second
//   node demo/run.js --live     real Claude staff with web search (a few minutes)
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeCompany } from '../src/runtime.js'
import { DEMO_IDEA, DEMO_PROBLEM } from './script.js'

const live = process.argv.includes('--live')
const file = join(mkdtempSync(join(tmpdir(), 'corp-demo-')), 'company.json')
const co = makeCompany({ file, brain: live ? 'claude' : 'scripted' })
const say = (s) => console.log(s)

say(`\nCorporate AI demo (${live ? 'live Claude staff' : 'offline script'})\n`)
const v = co.startVenture({ idea: DEMO_IDEA, problem: DEMO_PROBLEM })
say(`The CEO started ${v.id}: ${v.idea}`)
const plan = await co.plan(v.id)
say(`Naina (chief of staff) planned it: ${plan.summary}`)
for (const r of plan.tasks) say(r.ok ? `  + ${r.task.id} ${r.task.title} -> ${co.nameOf(r.task.assignee)}` : `  x refused: ${r.reason}`)

const max = Number(process.env.DEMO_STEPS || 12)
for (let i = 0; i < max; i++) {
  const next = co.runnable(v.id)[0]
  if (!next) break
  say(`\n${co.nameOf(next.assignee)} works on ${next.id} "${next.title}"…`)
  const r = await co.step({ task: next.id })
  if (!r.ok) { say(`  ! ${r.reason}`); continue }
  say(`  ${r.summary}`)
  for (const id of r.handoffs) say(`  -> handed off ${id} "${co.store.task(id).title}" to ${co.nameOf(co.store.task(id).assignee)}`)
  for (const why of r.handoffs_dropped) say(`  RAIL: handoff refused: ${why}`)
  for (const id of r.requests) { const q = co.store.request(id); say(`  ? asked the owner (${id}): ${q.kind === 'spend' ? `₹${q.amount_inr} to ${q.payee}` : q.reason}`) }
  for (const id of r.outreach) { const m = co.store.data.messages.find(x => x.id === id); say(`  @ drafted ${m.channel} to ${m.to_name} <${m.to}>, verified on ${m.source_url}`) }
  for (const why of r.outreach_blocked) say(`  RAIL: outreach blocked: ${why}`)
}

say('\n' + '-'.repeat(60) + '\n')
say(co.report(v.id))
say(`\n(data: ${file})`)
