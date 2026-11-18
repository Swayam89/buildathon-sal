// The CEO: an AI agent you chat with. It runs the company through a fixed set of tools.
// It can plan, delegate, run work and report. It has NO tool to approve or spend money:
// those requests stay with the human owner, and the rails still check everything the staff do.
import { orgBrief } from './org.js'

const S = (description) => ({ type: 'STRING', description })

// Tools the CEO may call. Each returns plain data the CEO reads back.
export function ceoTools(co) {
  return [
    { name: 'company_overview', description: 'Ventures, task counts, work ready to start, requests waiting for the owner, what the rails blocked.', parameters: { type: 'OBJECT', properties: {} },
      run: () => co.overview() },
    { name: 'org_chart', description: 'Everyone at the company with their id, title and duties. Use the ids to assign work.', parameters: { type: 'OBJECT', properties: {} },
      run: () => orgBrief() },
    { name: 'start_venture', description: 'Start a new business venture and have the chief of staff plan its first tasks.', parameters: { type: 'OBJECT', properties: { idea: S('The business idea.'), problem: S('Who has the problem and why.') }, required: ['idea'] },
      run: async (a) => { const v = co.startVenture({ idea: a.idea, problem: a.problem, by: 'ceo' }); const p = await co.plan(v.id); return { venture: v.id, plan: p.summary, tasks: p.tasks.map(r => r.ok ? `${r.task.id} ${r.task.title} -> ${co.nameOf(r.task.assignee)}` : `refused: ${r.reason}`) } } },
    { name: 'assign_task', description: 'Give one task to one staff member. The rails refuse unknown staff and duplicates, and say why.', parameters: { type: 'OBJECT', properties: { venture: S('Venture id, e.g. V1.'), title: S('What to do, under 10 words.'), detail: S('What a good result looks like.'), assignee: S('Staff id from org_chart.'), priority: { type: 'STRING', enum: ['urgent', 'normal', 'low'] } }, required: ['venture', 'title', 'assignee'] },
      run: (a) => { const r = co.addTask({ ...a, by: 'ceo' }); return r.ok ? { ok: true, task: r.task.id, to: co.nameOf(r.task.assignee) } : { ok: false, reason: r.reason } } },
    { name: 'list_tasks', description: 'Tasks, optionally for one venture or status (todo, doing, done, blocked, failed).', parameters: { type: 'OBJECT', properties: { venture: S('Venture id.'), status: S('Status.') } },
      run: (a) => co.store.tasks(Object.fromEntries(Object.entries({ venture: a.venture, status: a.status }).filter(([, v]) => v))).map(t => `${t.id} [${t.status}] ${t.title} -> ${co.nameOf(t.assignee)}${t.output?.summary ? `: ${t.output.summary}` : ''}`) },
    { name: 'run_steps', description: 'Let staff work: run up to N steps (default 1, at most 3). Each step one staff member does one task.', parameters: { type: 'OBJECT', properties: { count: { type: 'INTEGER', description: '1 to 3' } } },
      run: async (a) => { const out = []; for (let k = 0; k < Math.min(3, Math.max(1, a.count || 1)); k++) { const r = await co.step(); out.push(r.ok ? `${r.who} finished ${r.task}: ${r.summary}${r.outreach_blocked?.length ? ` (rails blocked: ${r.outreach_blocked.join('; ')})` : ''}` : r.reason); if (!r.ok) break } return out } },
    { name: 'read_work', description: 'The full deliverable of a finished task.', parameters: { type: 'OBJECT', properties: { task: S('Task id.') }, required: ['task'] },
      run: (a) => { const t = co.store.task(a.task); return t ? { title: t.title, by: co.nameOf(t.assignee), status: t.status, deliverable: t.output?.deliverable || '(not done yet)' } : { error: 'no such task' } } },
    { name: 'board_report', description: 'The board report: done, in progress, decisions waiting for the owner, outreach drafts, rail blocks.', parameters: { type: 'OBJECT', properties: { venture: S('Venture id, or empty for all.') } },
      run: (a) => co.report(a.venture) || 'No ventures yet.' },
  ]
}

const SYSTEM = (co) => `You are the CEO of ${co.name}, an AI company with 25 AI staff (a chief of staff and 8 departments). You talk with the owner, a human.
Use your tools to act: start ventures, assign work to the right person, let staff work, read their work and report back.
Rules you cannot change: you never approve or spend money (requests wait for the owner in the lobby); every contact the staff use is checked on its source page; every message says it is from an AI.
Be brief and concrete: say what you did, what came back, and what needs the owner's decision. Use task and venture ids. No filler.`

export class CEO {
  constructor({ co, brain }) {
    this.co = co; this.brain = brain; this.tools = ceoTools(co)
    this.history = []      // [{ role: 'user'|'model', parts }] kept short
  }

  get live() { return this.brain?.name?.startsWith('gemini') }

  async chat(message) {
    const text = String(message || '').trim().slice(0, 2000)
    if (!text) return { reply: 'Tell me what you want the company to do.', actions: [] }
    this.co.store.log('ceo', `You: ${text.slice(0, 140)}`)
    const result = this.live ? await this.chatGemini(text) : await this.chatOffline(text)
    this.co.store.log('ceo', `CEO: ${result.reply.slice(0, 160)}`)
    this.co.store.save()
    return result
  }

  // Gemini function calling: the model picks tools, we run them, it reads the results, up to 6 rounds.
  async chatGemini(text) {
    const actions = []
    const contents = [...this.history, { role: 'user', parts: [{ text }] }]
    const decl = this.tools.map(({ name, description, parameters }) => ({ name, description, parameters }))
    for (let round = 0; round < 6; round++) {
      const content = await this.brain.call({ systemInstruction: { parts: [{ text: SYSTEM(this.co) }] }, contents, tools: [{ functionDeclarations: decl }] })
      contents.push({ role: 'model', parts: content.parts })
      const calls = content.parts.filter(p => p.functionCall)
      if (!calls.length) {
        const reply = this.brain.text(content).trim() || 'Done.'
        this.history = contents.filter(c => c.parts.every(p => p.text)).slice(-10)
        return { reply, actions }
      }
      const responses = []
      for (const { functionCall: fc } of calls) {
        const tool = this.tools.find(t => t.name === fc.name)
        let result
        try { result = tool ? await tool.run(fc.args || {}) : { error: `unknown tool ${fc.name}` } } catch (e) { result = { error: e.message } }
        actions.push({ tool: fc.name, args: fc.args || {}, ok: !(result && (result.error || result.ok === false)) })
        responses.push({ functionResponse: { name: fc.name, response: { result } } })
      }
      contents.push({ role: 'user', parts: responses })
    }
    return { reply: 'I did several things; check the board report for where it stands.', actions }
  }

  // Without a Gemini key (offline stage mode): understand a few plain commands.
  async chatOffline(text) {
    const t = text.toLowerCase(), actions = []
    const run = async (name, args = {}) => { const tool = this.tools.find(x => x.name === name); const r = await tool.run(args); actions.push({ tool: name, args, ok: true }); return r }
    const idea = text.match(/(?:start|new business|venture|launch|build)\s*(?:a|an|the)?\s*(?:venture|business)?\s*(?:for|:)?\s*(.+)/i)?.[1]
    if (/^(start|new business|launch|build)/.test(t) && idea) {
      const r = await run('start_venture', { idea })
      return { reply: `Started ${r.venture}. Plan: ${r.plan}\n${r.tasks.join('\n')}\nSay "run 3" to let the team work.`, actions }
    }
    if (/^(run|work|go|continue)/.test(t)) {
      const r = await run('run_steps', { count: Number(t.match(/\d/)?.[0]) || 1 })
      return { reply: r.join('\n'), actions }
    }
    if (/(report|status|update|waiting|decision|how.*going)/.test(t)) {
      const o = await run('company_overview')
      const waits = o.pending_requests.map(r => `${r.id}: ${r.kind === 'spend' ? `₹${r.amount_inr} to ${r.payee}` : r.reason}`).join('\n') || 'nothing'
      return { reply: `${o.ventures.map(v => `${v.id} ${v.idea} (${v.status})`).join('\n') || 'No ventures yet.'}\nReady to start: ${o.ready.length}\nWaiting on you:\n${waits}\nRails blocked: ${Object.values(o.rails_blocked).reduce((a, b) => a + b, 0)}`, actions }
    }
    if (/(team|org|who)/.test(t)) return { reply: await run('org_chart'), actions }
    return { reply: 'I am running offline (no Gemini key), so I understand: "start <idea>", "run 3", "status", "team". Add GEMINI_API_KEY to app/.env for full conversation.', actions }
  }
}
