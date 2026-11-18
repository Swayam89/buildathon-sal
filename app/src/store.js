// The company's records: ventures, tasks, deliverables, approval requests,
// outbound messages and an event log. One JSON file, written atomically,
// so the dashboard, the MCP server and the demo can share it.
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'

const empty = () => ({ seq: { venture: 0, task: 0, request: 0, message: 0, event: 0 }, ventures: [], tasks: [], requests: [], messages: [], events: [] })

export class Store {
  constructor(file = null, { now = () => Date.now() } = {}) {
    this.file = file
    this.now = now
    this.data = file && existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : empty()
  }

  // Re-read the file (another process may have written it).
  reload() { if (this.file && existsSync(this.file)) this.data = JSON.parse(readFileSync(this.file, 'utf8')) }

  save() {
    if (!this.file) return
    mkdirSync(dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    writeFileSync(tmp, JSON.stringify(this.data, null, 2))
    renameSync(tmp, this.file)
  }

  next(kind) { this.data.seq[kind] += 1; return this.data.seq[kind] }

  log(type, text, extra = {}) {
    const e = { id: this.next('event'), at: this.now(), type, text, ...extra }
    this.data.events.push(e)
    if (this.data.events.length > 500) this.data.events.splice(0, this.data.events.length - 500)
    return e
  }

  // Ventures (one business idea each).
  addVenture({ idea, problem = '' }) {
    const v = { id: `V${this.next('venture')}`, idea, problem, status: 'planning', plan: null, created: this.now() }
    this.data.ventures.push(v)
    return v
  }
  venture(id) { return this.data.ventures.find(v => v.id === id) || null }

  // Tasks form a graph: a task can wait on others (deps) and comes from someone (by).
  addTask({ venture, title, detail = '', assignee, by, priority = 'normal', deps = [], parent = null }) {
    const t = {
      id: `T${this.next('task')}`, venture, title, detail, assignee, by, priority, deps, parent,
      status: 'todo', output: null, attempts: 0, created: this.now(), done_at: null,
    }
    this.data.tasks.push(t)
    return t
  }
  task(id) { return this.data.tasks.find(t => t.id === id) || null }
  tasks(filter = {}) {
    return this.data.tasks.filter(t => Object.entries(filter).every(([k, v]) => t[k] === v))
  }

  // Anything that costs money or needs the owner's say: never done by the company itself.
  addRequest({ venture, task, by, kind, amount_inr = 0, payee = '', reason }) {
    const r = { id: `R${this.next('request')}`, venture, task, by, kind, amount_inr, payee, reason, status: 'pending', created: this.now(), decided: null, note: '' }
    this.data.requests.push(r)
    return r
  }
  request(id) { return this.data.requests.find(r => r.id === id) || null }

  // Outbound emails and calls, as drafts or (when allowed) sent.
  addMessage(m) {
    const msg = { id: `M${this.next('message')}`, created: this.now(), ...m }
    this.data.messages.push(msg)
    return msg
  }
}
