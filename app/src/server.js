// The dashboard: a small JSON API over the company, plus the static page in public/.
// Local only (127.0.0.1). The owner approves or declines money here; agents can't.
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { join, extname, normalize } from 'node:path'
import { makeCompany, APP_DIR } from './runtime.js'

const PORT = Number(process.env.PORT || 4700)
const PUBLIC = join(APP_DIR, 'public')
const co = makeCompany()
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }

let busy = null            // what the company is doing right now (one step at a time)
let autopilot = null       // timer while autopilot is on

async function work(label, fn) {
  if (busy) return { ok: false, reason: `busy: ${busy}` }
  busy = label
  try { return await fn() } finally { busy = null }
}

async function autoStep() {
  co.store.reload()
  if (busy || !co.runnable().length) return
  await work('autopilot step', () => co.step())
}

function state() {
  co.store.reload()
  const d = co.store.data
  return {
    busy, autopilot: !!autopilot, brain: co.brain.name,
    overview: co.overview(), floors: co.floors(),
    ventures: d.ventures, tasks: d.tasks.map(({ output, ...t }) => ({ ...t, summary: output?.summary || '', assignee_name: co.nameOf(t.assignee), by_name: co.nameOf(t.by) })),
    requests: d.requests.map(r => ({ ...r, by_name: co.nameOf(r.by) })),
    messages: d.messages.map(m => ({ ...m, from_name: co.nameOf(m.from) })),
    events: d.events.slice(-120),
  }
}

const routes = {
  'GET /api/state': () => state(),
  'GET /api/report': (q) => ({ report: co.report(q.get('venture') || null) || 'No ventures yet.' }),
  'GET /api/task': (q) => { const t = co.store.task(q.get('id')); return t ? { ...t, assignee_name: co.nameOf(t.assignee) } : { ok: false, reason: 'no such task' } },
  'POST /api/venture': (q, b) => work('planning', async () => {
    const v = co.startVenture({ idea: b.idea, problem: b.problem })
    const plan = await co.plan(v.id)
    return { ok: true, venture: v, plan }
  }),
  'POST /api/step': (q, b) => work('running a step', () => co.step({ venture: b.venture, task: b.task })),
  'POST /api/decide': (q, b) => co.decide(b.id, { approve: !!b.approve, note: b.note || '', by: 'owner' }),
  'POST /api/task': (q, b) => co.setTask(b.id, b),
  'POST /api/autopilot': (q, b) => {
    if (b.on && !autopilot) autopilot = setInterval(() => autoStep().catch(e => co.store.log('error', e.message)), Number(process.env.AUTOPILOT_MS || 4000))
    if (!b.on && autopilot) { clearInterval(autopilot); autopilot = null }
    return { ok: true, autopilot: !!autopilot }
  },
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const send = (code, body, type = 'application/json') => { res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store' }); res.end(type === 'application/json' ? JSON.stringify(body) : body) }
  try {
    const route = routes[`${req.method} ${url.pathname}`]
    if (route) {
      let body = {}
      if (req.method === 'POST') { let raw = ''; for await (const c of req) { raw += c; if (raw.length > 100_000) throw new Error('body too large') } body = raw ? JSON.parse(raw) : {} }
      const out = await route(url.searchParams, body)
      return send(out?.ok === false ? 400 : 200, out)
    }
    if (req.method !== 'GET') return send(404, { ok: false, reason: 'not found' })
    const file = normalize(join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname))
    if (!file.startsWith(PUBLIC)) return send(403, { ok: false })
    return send(200, await readFile(file), TYPES[extname(file)] || 'application/octet-stream')
  } catch (e) {
    return send(e.code === 'ENOENT' ? 404 : 500, { ok: false, reason: e.code === 'ENOENT' ? 'not found' : e.message })
  }
})

server.listen(PORT, '127.0.0.1', () => console.log(`Corporate AI dashboard on http://127.0.0.1:${PORT} (brain: ${co.brain.name})`))
