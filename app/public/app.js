// Corporate AI, inside: the 3D building plus the floor list and floor panels.
// Polls /api/state every 2 seconds. Plain JS modules, no build step.
import { createBuilding, LEVELS } from './building3d.js'

const $ = (s, el = document) => el.querySelector(s)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`
const api = (path, body) => fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}).then(r => r.json())

const LABEL = { lobby: 'G', terrace: 'R', office: '9' }
const num = (id) => LABEL[id] ?? String(LEVELS.indexOf(id))
const TITLE = { lobby: 'Lobby', terrace: 'Terrace', office: 'Chief of staff' }
const RULE = { verified_contact: 'Made-up contact', money: 'Money commitment', duplicate: 'Duplicate work', task_graph: 'Task graph', injection: 'Hidden instructions' }

let S = null          // latest state from the server
let current = null    // selected level id, or null for the whole building

// ---------- 3D ----------
let building = null
try { building = createBuilding($('#scene'), { onSelect: (id) => open(id) }) }
catch (e) { $('#scene').hidden = true; console.warn('3D view unavailable:', e.message) }

// ---------- Small renderers ----------
function md(src) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/(https?:\/\/[^\s)|<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
  const lines = String(src || '').split('\n'), out = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/^\|/.test(l)) {
      const rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]); i--
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
      out.push('<table>' + rows.filter(r => !/^\|[\s:|-]+\|$/.test(r)).map((r, n) => `<tr>${cells(r).map(c => n ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`).join('')}</tr>`).join('') + '</table>')
    } else if (/^#{1,3} /.test(l)) { const h = l.match(/^#+/)[0].length; out.push(`<h${h}>${inline(l.slice(h + 1))}</h${h}>`) }
    else if (/^\s*([-*]|\d+\.) /.test(l)) out.push(`<li>${inline(l.replace(/^\s*([-*]|\d+\.) /, ''))}</li>`)
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`)
  }
  return `<div class="md">${out.join('')}</div>`
}
const modal = (html) => { $('#modal-body').innerHTML = html; $('#modal').showModal() }

const deptOf = () => Object.fromEntries((S?.floors || []).flatMap(f => f.people.map(p => [p.id, f.id])))
function levelTasks(id) {
  const d = deptOf()
  return (S?.tasks || []).filter(t => d[t.assignee] === id)
}
const taskCard = (t) => `<div class="card task" data-task="${esc(t.id)}">
  <div class="t"><span class="state ${esc(t.status)}">${esc(t.status)}</span>${esc(t.id)} ${esc(t.title)}</div>
  <div class="m">${esc(t.assignee_name)}, ${esc(t.priority)}${t.deps.length ? `, after ${esc(t.deps.join(', '))}` : ''}${t.by_name && t.by_name !== 'Naina' ? `, from ${esc(t.by_name)}` : ''}</div>
  ${t.summary ? `<div class="s">${esc(t.summary)}</div>` : ''}</div>`

// ---------- Floor list ----------
function renderLevels() {
  const order = [...LEVELS].reverse()
  $('#levels').innerHTML = order.map(id => {
    const tasks = levelTasks(id)
    const busy = tasks.some(t => t.status === 'doing'), todo = tasks.filter(t => t.status === 'todo').length, done = tasks.filter(t => t.status === 'done').length
    const floor = S?.floors.find(f => f.id === id)
    const name = TITLE[id] || floor?.name || id
    const sub = id === 'terrace' ? 'JARVIS, your CEO agent' : id === 'lobby' ? `${S?.ventures.length || 0} venture${S?.ventures.length === 1 ? "" : "s"}, ${S?.requests.filter(r => r.status === 'pending').length || 0} waiting on you` : `${todo} to do, ${done} done`
    return `<li><button class="level ${busy ? 'busy' : todo ? 'waiting' : ''} ${id === 'terrace' ? 'top' : ''}" data-level="${id}" aria-current="${current === id}">
      <span class="n">${num(id)}</span><span><span class="name">${esc(name)}</span><span class="sub">${esc(sub)}</span></span><span class="dot"></span></button></li>`
  }).join('')
}

// ---------- Panels ----------
// Each panel has a live part (re-rendered every poll) and a form part (rendered once, so typing isn't lost).
function open(id) {
  current = id
  building?.select(id)
  $('#panel').hidden = !id
  $('#crumb').innerHTML = id ? `/ <b>${id === 'lobby' ? 'Lobby' : id === 'terrace' ? 'Terrace' : `Floor ${num(id)}`}</b>` : ''
  if (id) $('#panel-body').innerHTML = `<div id="p-live"></div><div id="p-form"></div>`
  if (id) renderForm(id)
  render()
}

function ventureSelect() {
  const vs = (S?.ventures || []).filter(v => v.status !== 'closed')
  if (vs.length <= 1) return vs[0] ? `<input type="hidden" name="venture" value="${esc(vs[0].id)}">` : ''
  return `<label>Venture<select name="venture">${vs.map(v => `<option value="${esc(v.id)}">${esc(v.id)} ${esc(v.idea)}</option>`).join('')}</select></label>`
}

function renderForm(id) {
  const box = $('#p-form'); if (!box) return
  if (id === 'lobby') {
    box.innerHTML = `<h2>Start a venture</h2>
      <form class="work" id="f-venture">
        <label>Business idea<input name="idea" required placeholder="Monthly Assam tea box for office teams in Gurugram"></label>
        <label>Who has the problem, and why?<textarea name="problem" placeholder="Office managers re-order tea every week from whoever is cheapest..."></textarea></label>
        <button class="btn go">Start and plan it</button><p class="note" id="n-venture"></p>
      </form>`
    return
  }
  if (id === 'terrace') { box.innerHTML = ''; return }
  const floor = S?.floors.find(f => f.id === id)
  if (!floor) { box.innerHTML = ''; return }
  box.innerHTML = `<h2>Give them work <small>From you</small></h2>
    ${S?.ventures.length ? `<form class="work" id="f-work">
      ${ventureSelect()}
      <div class="row">
        <label>Who<select name="assignee">${floor.people.map(p => `<option value="${esc(p.id)}">${esc(p.name)}, ${esc(p.title)}</option>`).join('')}</select></label>
        <label>Priority<select name="priority"><option value="urgent">You have to do this</option><option value="normal" selected>Normal</option><option value="low">When free</option></select></label>
      </div>
      <label>Task<input name="title" required maxlength="120" placeholder="What to do, in a few words"></label>
      <label>Details<textarea name="detail" placeholder="What a good result looks like"></textarea></label>
      <button class="btn go">Give it to them</button><p class="note" id="n-work"></p>
    </form>` : '<p class="empty">Start a venture in the lobby first.</p>'}`
}

function renderLive() {
  const box = $('#p-live'); if (!box || !current) return
  const id = current
  if (id === 'terrace') {
    const o = S.overview
    box.innerHTML = `<p class="kicker">Terrace, the CEO's office</p><h1>JARVIS</h1>
      <p class="lede">A Claude agent that runs the company as CEO through MCP. It plans ventures, gives out work, runs the staff and reads you the board report. It can't approve money. Only you can.</p>
      <div class="chips"><span class="chip">${o.staff} staff</span><span class="chip">${o.ventures.length} venture${o.ventures.length === 1 ? "" : "s"}</span><span class="chip">${o.pending_requests.length} waiting on you</span></div>
      <h2>Talk to JARVIS</h2>
      <p class="lede">Open Claude Code in this repo. The <code>.mcp.json</code> file connects it to the company. Then say:</p>
      <div class="code">You're the CEO of Corporate AI. Start a venture for a monthly Assam tea box for offices in Gurugram, plan it, run steps until the queue is empty, and give me the board report.</div>
      <h2>Its tools</h2>
      <div class="code">company_overview  org_chart  start_venture  plan_venture
assign_task  list_tasks  run_step  read_work  set_task
verify_contact  board_report</div>
      <h2>Board report</h2>
      <button class="btn go" id="b-report">Read the board report</button>`
    return
  }
  if (id === 'lobby') {
    const pending = S.requests.filter(r => r.status === 'pending'), decided = S.requests.filter(r => r.status !== 'pending')
    const rails = S.events.filter(e => e.type === 'rail').reverse()
    box.innerHTML = `<p class="kicker">Ground floor</p><h1>Lobby</h1>
      <p class="lede">Ventures come in here, money waits here for you, and every message that leaves the building is checked here first.</p>
      <h2>Ventures <small>${S.ventures.length}</small></h2>
      ${S.ventures.map(v => `<div class="card"><b>${esc(v.id)}</b> ${esc(v.idea)} <span class="state ${v.status === 'running' ? 'doing' : ''}">${esc(v.status)}</span>${v.plan ? `<div class="s" style="color:var(--muted);font-size:13px;margin-top:4px">${esc(v.plan)}</div>` : ''}</div>`).join('') || '<p class="empty">No ventures yet. Start one below.</p>'}
      <h2>Needs your decision <small>The company never pays</small></h2>
      ${[...pending, ...decided.reverse()].map(r => `<div class="card req ${r.status === 'pending' ? '' : 'decided'}">
        ${r.kind === 'spend' ? `<div class="amt">${inr(r.amount_inr)}</div><div>to <b>${esc(r.payee)}</b></div>` : '<div class="amt">Decision</div>'}
        <div style="margin-top:4px">${esc(r.reason)}</div>
        <div class="m" style="color:var(--faint);font-size:12.5px;margin-top:4px">${esc(r.id)}, asked by ${esc(r.by_name)}${r.status !== 'pending' ? `, <b>${esc(r.status)}</b>` : ''}</div>
        ${r.status === 'pending' ? `<div class="acts"><button class="btn go" data-approve="${esc(r.id)}">Approve</button><button class="btn no" data-decline="${esc(r.id)}">Decline</button></div>` : ''}
      </div>`).join('') || '<p class="empty">Nothing waiting.</p>'}
      <h2>Outreach drafts <small>Verified on the source page</small></h2>
      ${[...S.messages].reverse().map(m => `<div class="card msg">
        <div class="to">${m.channel === 'call' ? 'Call' : 'Email'} to ${esc(m.to_name)} <code>${esc(m.to)}</code></div>
        <div class="ev">Found on <a href="${esc(m.source_url)}" target="_blank" rel="noopener">${esc(m.source_url)}</a>${m.evidence ? `: “${esc(m.evidence)}”` : ''}</div>
        <pre>${esc(m.body)}</pre></div>`).join('') || '<p class="empty">No outreach yet.</p>'}
      <h2>Rails <small>What the code stopped</small></h2>
      ${rails.slice(0, 12).map(e => `<div class="card rail-hit"><div class="rule">${esc(RULE[e.rule] || 'Rail')}</div>${esc(e.text)}</div>`).join('') || '<p class="empty">Nothing blocked yet.</p>'}`
    return
  }
  const floor = S.floors.find(f => f.id === id)
  if (!floor) return
  const tasks = levelTasks(id)
  box.innerHTML = `<p class="kicker">${id === 'office' ? 'Floor 9' : `Floor ${num(id)}`}</p><h1>${esc(TITLE[id] || floor.name)}</h1>
    <div class="chips"><span class="chip">${floor.people.length} ${floor.people.length === 1 ? 'person' : 'people'}</span><span class="chip">${tasks.filter(t => t.status === 'done').length} tasks done</span><span class="chip">Claude Sonnet, medium effort</span></div>
    <h2>The team</h2>
    ${floor.people.map(p => {
      const mine = S.tasks.filter(t => t.assignee === p.id)
      const doing = mine.find(t => t.status === 'doing'), waiting = mine.filter(t => t.status === 'todo').length
      const now = doing ? `<div class="now working">Working on ${esc(doing.id)}: ${esc(doing.title)}</div>` : waiting ? `<div class="now waiting">${waiting} task${waiting > 1 ? 's' : ''} waiting</div>` : '<div class="now">Free for work</div>'
      return `<div class="card person ${p.head ? 'head' : ''}"><div class="avatar">${esc(p.name[0])}</div><div>
        <div class="who"><b>${esc(p.name)}</b><span>${esc(p.title)}</span></div>
        <div class="duty">${esc(p.duties)}</div>${now}
        <span class="chip">${p.done} done</span></div></div>`
    }).join('')}
    <h2>Work on this floor <small>${tasks.length}</small></h2>
    ${tasks.length ? [...tasks].reverse().map(taskCard).join('') : '<p class="empty">Nothing yet.</p>'}`
}

// ---------- Whole page ----------
function render() {
  if (!S) return
  const working = S.tasks.filter(t => t.status === 'doing').length
  const today = new Date(); today.setHours(0, 0, 0, 0)
  $('#s-working').textContent = working
  $('#s-steps').textContent = S.events.filter(e => e.type === 'step' && e.at >= today.getTime()).length
  $('#s-outreach').textContent = S.messages.length
  $('#s-rails').textContent = S.events.filter(e => e.type === 'rail').length
  $('#s-brain').textContent = S.brain === 'scripted' ? 'Offline demo' : 'Live Claude'
  $('#autopilot').checked = S.autopilot
  $('#step').disabled = !!S.busy
  $('#step').textContent = S.busy ? 'Working…' : 'Run one step'
  const last = S.events.at(-1)
  if (last) $('#ticker').innerHTML = `<b>${esc(last.type === 'rail' ? 'Rail' : last.type[0].toUpperCase() + last.type.slice(1))}</b> ${esc(last.text)}`
  const d = deptOf(), busy = {}
  for (const t of S.tasks) if (t.status === 'doing') busy[d[t.assignee]] = true
  building?.setBusy(busy)
  renderLevels()
  renderLive()
}

async function refresh() {
  try {
    const first = !S
    S = await api('/api/state')
    if (first && current) renderForm(current)
    render()
  } catch { /* server restarting */ }
}

// ---------- Actions ----------
document.addEventListener('click', async (e) => {
  const lvl = e.target.closest('[data-level]')
  if (lvl) return open(lvl.dataset.level)
  const dec = e.target.closest('[data-approve],[data-decline]')
  if (dec) { await api('/api/decide', { id: dec.dataset.approve || dec.dataset.decline, approve: !!dec.dataset.approve }); return refresh() }
  const t = e.target.closest('[data-task]')
  if (t) {
    const x = await api(`/api/task?id=${encodeURIComponent(t.dataset.task)}`)
    return modal(`<p class="kicker">${esc(x.assignee_name)}, ${esc(x.status)}</p><h1 style="margin:0 0 8px">${esc(x.id)} ${esc(x.title)}</h1>${x.detail ? `<p style="color:var(--muted)">${esc(x.detail)}</p>` : ''}${x.output ? md(x.output.deliverable) : '<p class="empty">Not done yet.</p>'}`)
  }
  if (e.target.id === 'b-report') return modal(md((await api('/api/report')).report))
})
document.addEventListener('submit', async (e) => {
  e.preventDefault()
  const f = e.target, data = Object.fromEntries(new FormData(f)), btn = f.querySelector('button')
  btn.disabled = true
  if (f.id === 'f-venture') {
    $('#n-venture').textContent = 'Naina is planning it…'
    const r = await api('/api/venture', data)
    $('#n-venture').textContent = r.ok === false ? r.reason : `Planned ${r.plan.tasks.filter(x => x.ok).length} tasks.`
    if (r.ok !== false) f.reset()
  }
  if (f.id === 'f-work') {
    const r = await api('/api/assign', data)
    const n = $('#n-work')
    n.className = `note ${r.ok === false ? 'bad' : ''}`
    n.textContent = r.ok === false ? `Refused by the rails: ${r.reason}` : `Gave ${r.task.id} to ${r.task.assignee}.`
    if (r.ok !== false) f.reset()
  }
  btn.disabled = false
  refresh()
})
$('#back').addEventListener('click', () => open(null))
$('#step').addEventListener('click', async () => {
  $('#step').disabled = true
  const p = api('/api/step', {}); setTimeout(refresh, 300)
  const r = await p
  if (r.ok === false) $('#ticker').innerHTML = `<b>Nothing to run</b> ${esc(r.reason)}`
  refresh()
})
$('#autopilot').addEventListener('change', (e) => api('/api/autopilot', { on: e.target.checked }).then(refresh))
addEventListener('keydown', (e) => {
  if (e.target.closest('input,textarea,select') || $('#modal').open) return
  if (e.key === 'Escape') open(null)
  const order = [...LEVELS], i = order.indexOf(current)
  if (e.key === 'ArrowUp') open(order[Math.min(order.length - 1, i + 1)])
  if (e.key === 'ArrowDown') open(order[Math.max(0, i < 0 ? 0 : i - 1)])
})

// Deep links: /#lobby, /#finance, /#terrace open that floor.
const fromHash = () => { const id = location.hash.slice(1); if (LEVELS.includes(id)) open(id) }
addEventListener('hashchange', fromHash)

refresh().then(fromHash)
setInterval(refresh, 2000)
