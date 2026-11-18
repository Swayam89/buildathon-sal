// MCP server (stdio, JSON-RPC 2.0): the tools the CEO agent uses to run the company.
// Add it to Claude Code with the .mcp.json at the repo root, then talk to Claude as the CEO.
// The CEO can plan, delegate, run work and read results; it can NOT approve spending.
// Money decisions belong to the human owner (the dashboard), and the rails apply to everyone.
import { createInterface } from 'node:readline'
import { makeCompany } from './runtime.js'
import { orgBrief } from './org.js'
import { verifyContact } from './rails.js'

const co = makeCompany()
const str = (description) => ({ type: 'string', description })

export const TOOLS = [
  { name: 'company_overview', description: 'Ventures, task counts, work ready to start, requests waiting for the owner, and what the rails have blocked.', inputSchema: { type: 'object', properties: {} },
    run: () => co.overview() },
  { name: 'org_chart', description: 'Everyone at the company: id, name, title, duties. Use the ids to assign work.', inputSchema: { type: 'object', properties: {} },
    run: () => orgBrief() },
  { name: 'start_venture', description: 'Start a new business venture from an idea.', inputSchema: { type: 'object', required: ['idea'], properties: { idea: str('The business idea.'), problem: str('Who has the problem and why.') } },
    run: (a) => co.startVenture({ idea: a.idea, problem: a.problem }) },
  { name: 'plan_venture', description: 'Ask the chief of staff to draft a plan and first tasks for a venture (use this or assign_task).', inputSchema: { type: 'object', required: ['venture'], properties: { venture: str('Venture id, e.g. V1.') } },
    run: (a) => co.plan(a.venture) },
  { name: 'assign_task', description: 'Give a task to one staff member. The rails refuse unknown staff, duplicates of existing tasks and unknown dependencies, and say why.', inputSchema: { type: 'object', required: ['venture', 'title', 'assignee'], properties: {
      venture: str('Venture id.'), title: str('What to do, under 10 words.'), detail: str('What a good result looks like.'), assignee: str('Staff id from org_chart.'),
      priority: { type: 'string', enum: ['urgent', 'normal', 'low'] }, after: { type: 'array', items: { type: 'string' }, description: 'Task ids that must finish first.' } } },
    run: (a) => co.addTask({ venture: a.venture, title: a.title, detail: a.detail, assignee: a.assignee, priority: a.priority, deps: a.after || [], by: 'ceo' }) },
  { name: 'list_tasks', description: 'Tasks, optionally for one venture or status (todo, doing, done, blocked, failed, cancelled).', inputSchema: { type: 'object', properties: { venture: str('Venture id.'), status: str('Status filter.') } },
    run: (a) => co.store.tasks(Object.fromEntries(Object.entries({ venture: a.venture, status: a.status }).filter(([, v]) => v)))
      .map(t => ({ id: t.id, title: t.title, assignee: co.nameOf(t.assignee), status: t.status, priority: t.priority, after: t.deps, summary: t.output?.summary || '' })) },
  { name: 'run_step', description: 'One staff member does one task (the most urgent ready one, or the task given). Takes up to a few minutes. Returns what they did, handoffs, requests and outreach, including anything the rails blocked.', inputSchema: { type: 'object', properties: { venture: str('Venture id.'), task: str('Task id.') } },
    run: (a) => co.step({ venture: a.venture, task: a.task }) },
  { name: 'read_work', description: 'The full deliverable of a finished task.', inputSchema: { type: 'object', required: ['task'], properties: { task: str('Task id.') } },
    run: (a) => { const t = co.store.task(a.task); return t ? { id: t.id, title: t.title, by: co.nameOf(t.assignee), status: t.status, ...t.output } : { error: `no task ${a.task}` } } },
  { name: 'set_task', description: 'Change a task: priority, cancel, or retry a failed/blocked one.', inputSchema: { type: 'object', required: ['task'], properties: { task: str('Task id.'), priority: { type: 'string', enum: ['urgent', 'normal', 'low'] }, cancel: { type: 'boolean' }, retry: { type: 'boolean' } } },
    run: (a) => co.setTask(a.task, a) },
  { name: 'verify_contact', description: 'Check that an email or phone number is really printed on a web page before using it.', inputSchema: { type: 'object', required: ['source_url'], properties: { email: str('Email address.'), phone: str('Phone number.'), source_url: str('Page that should show it.') } },
    run: (a) => verifyContact(a, { fetchImpl: co.fetchImpl }) },
  { name: 'board_report', description: 'The board report: done, in progress, stuck, decisions waiting for the owner, outreach drafts and rail blocks.', inputSchema: { type: 'object', properties: { venture: str('Venture id (all if empty).') } },
    run: (a) => co.report(a.venture) || 'No ventures yet.' },
]

const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n')
const reply = (id, result) => send({ jsonrpc: '2.0', id, result })
const fail = (id, code, message) => send({ jsonrpc: '2.0', id, error: { code, message } })

export async function handle(msg) {
  const { id, method, params = {} } = msg
  if (method === 'initialize') return reply(id, { protocolVersion: params.protocolVersion || '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'corporate-ai', version: '0.1.0' } })
  if (method === 'ping') return reply(id, {})
  if (method === 'tools/list') return reply(id, { tools: TOOLS.map(({ run, ...t }) => t) })
  if (method === 'tools/call') {
    const tool = TOOLS.find(t => t.name === params.name)
    if (!tool) return fail(id, -32602, `unknown tool ${params.name}`)
    try {
      co.store.reload() // the dashboard may have changed something
      const out = await tool.run(params.arguments || {})
      co.store.save()
      const text = typeof out === 'string' ? out : JSON.stringify(out, null, 2)
      return reply(id, { content: [{ type: 'text', text }], isError: out?.ok === false })
    } catch (e) {
      return reply(id, { content: [{ type: 'text', text: `Error: ${e.message}` }], isError: true })
    }
  }
  if (id !== undefined) return fail(id, -32601, `unknown method ${method}`)
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const rl = createInterface({ input: process.stdin })
  rl.on('line', (line) => { if (!line.trim()) return; let msg; try { msg = JSON.parse(line) } catch { return fail(null, -32700, 'parse error') } handle(msg) })
}
