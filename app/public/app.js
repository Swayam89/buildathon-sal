// Corporate AI, inside: the 3D building plus the floor list and floor panels.
// Building view: scroll (or arrow keys) moves between floors; click a floor or press Enter to go in.
// Inside a floor: the panel shows the team, a form to give them work, their tasks, activity and documents.
import { createBuilding, LEVELS } from './building3d.js'

const $ = (s) => document.querySelector(s)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`
const ago = (ms) => { const s = Math.max(0, (Date.now() - ms) / 1000); return s < 60 ? 'just now' : s < 3600 ? `${s / 60 | 0} min ago` : `${s / 3600 | 0} h ago` }
const api = (path, body) => fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}).then(r => r.json())

const NUM = { lobby: 'G', terrace: 'R', office: '9' }
const num = (id) => NUM[id] ?? String(LEVELS.indexOf(id))
const NAME = { lobby: 'Lobby', terrace: 'Terrace', office: 'Chief of staff', finance: 'Finance and accounts', tech: 'Tech and product', hr: 'HR and admin', legal: 'Legal and compliance', support: 'Customer support' }
const RULE = { verified_contact: 'Made-up contact', money: 'Money commitment', duplicate: 'Duplicate work', task_graph: 'Task graph', injection: 'Hidden instructions' }
const PRIORITY = [['urgent', 'You have to do this'], ['normal', 'Normal'], ['low', 'When free']]

let S = null              // latest state
let focusId = 'lobby'     // floor highlighted on the building view
let inside = null         // floor we're inside, or null
let tab = 'progress'      // In progress / Done
let priority = 'normal'

// ---------- 3D ----------
let building = null
try {
  building = createBuilding($('#scene'), {
    onFocus: (id) => { focusId = id; renderLevels() },
    onEnter: (id) => show(id),
  })
} catch (e) { console.warn('3D view unavailable:', e.message) }

// ---------- Helpers ----------
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
// Replace an element's HTML only when it changed, so a click is never lost to a redraw.
const setHTML = (el, html) => { if (el && el.__html !== html) { el.innerHTML = html; el.__html = html } }
const modal = (html) => { $('#modal-body').innerHTML = html; $('#modal').showModal() }
const floorOf = (id) => S?.floors.find(f => f.id === id)
const deptOf = () => Object.fromEntries((S?.floors || []).flatMap(f => f.people.map(p => [p.id, f.id])))
const tasksOn = (id) => { const d = deptOf(); return (S?.tasks || []).filter(t => d[t.assignee] === id) }

// ---------- Floor list ----------
function renderLevels() {
  const rail = $('#rail')
  rail.classList.toggle('compact', !!inside)
  setHTML($('#levels'), [...LEVELS].reverse().map(id => {
    const ts = tasksOn(id)
    const busy = ts.some(t => t.status === 'doing')
    const sub = id === 'terrace' ? 'Your CEO, an AI agent'
      : id === 'lobby' ? 'Ventures and approvals'
      : `${ts.filter(t => t.status === 'todo').length} to do · ${ts.filter(t => t.status === 'done').length} done`
    const current = inside ? inside === id : focusId === id
    return `<li><button class="level ${busy ? 'busy' : ''} ${id === 'terrace' ? 'top' : ''}" data-level="${id}" aria-current="${current}" title="${esc(NAME[id] || floorOf(id)?.name || id)}">
      <span class="n">${num(id)}</span><span><span class="name">${esc(NAME[id] || floorOf(id)?.name || id)}</span><span class="sub">${esc(sub)}</span></span><span class="dot"></span></button></li>`
  }).join(''))
}

// ---------- Panels ----------
function show(id) {
  inside = id
  $('#panel').hidden = !id
  $('#hint').hidden = !!id
  $('#crumb').innerHTML = id ? ` / <b>${id === 'lobby' ? 'Lobby' : id === 'terrace' ? 'Terrace' : `Floor ${num(id)}`}</b>` : ''
  if (id && location.hash !== `#${id}`) history.replaceState(null, '', `#${id}`)
  if (!id && location.hash) history.replaceState(null, '', location.pathname)
  tab = 'progress'; priority = 'normal'
  $('#panel').scrollTop = 0
  for (const el of ['#p-live', '#p-after']) { const e = $(el); if (e) { e.innerHTML = ''; e.__html = '' } }
  renderForm(); render()
}

function renderForm() {
  const box = $('#p-form'); box.innerHTML = ''
  if (!inside || inside === 'terrace') return
  if (inside === 'lobby') {
    box.style.order = S?.ventures.length ? '' : '-1'
    box.innerHTML = `<h2>Start a venture <small>Your CEO plans it</small></h2>
      <form class="formcard" id="f-venture">
        <label>Business idea<input name="idea" required placeholder="Monthly Assam tea box for office teams in Gurugram"></label>
        <label>Who has the problem, and why?<textarea name="problem" placeholder="Office managers re-order tea every week from whoever is cheapest..."></textarea></label>
        <button class="give">Start and plan it</button><p class="note" id="n-venture"></p>
      </form>`
    return
  }
  const floor = floorOf(inside); if (!floor) return
  const vs = (S?.ventures || []).filter(v => v.status !== 'closed')
  box.innerHTML = `<h2>Give them work <small>From you</small></h2>
    ${vs.length ? `<form class="formcard" id="f-work">
      <div class="row">
        <label>Who<select name="assignee">${floor.people.map(p => `<option value="${esc(p.id)}">${esc(p.name)}, ${esc(p.title)}</option>`).join('')}</select></label>
        <label>For<select name="venture">${vs.map(v => `<option value="${esc(v.id)}">${esc(v.idea)}</option>`).join('')}</select></label>
      </div>
      <label>Task<input name="title" required maxlength="120" placeholder="What should they do?"></label>
      <label>Details<textarea name="detail" placeholder="What does done look like? Links, numbers, deadlines."></textarea></label>
      <div class="seg" role="group" aria-label="Priority">${PRIORITY.map(([v, l]) => `<button type="button" data-priority="${v}" aria-pressed="${v === priority}">${l}</button>`).join('')}</div>
      <button class="give">Give this task</button><p class="note" id="n-work"></p>
    </form>` : '<div class="emptybox">Start a venture in the lobby first, then give this floor work.</div>'}`
}

function renderLive() {
  const box = $('#p-live'); if (!box || !inside || !S) return
  if (inside === 'terrace') {
    const o = S.overview
    setHTML(box, `<p class="kicker">The terrace</p><h1>Your CEO</h1>
      <p class="lede">An AI agent that runs Corporate AI. It plans each venture, hands work to the floors, runs the staff and reads you the board report. It works through MCP tools, and it can't approve money: only you can.</p>
      <div class="chips"><span class="chip">${o.staff} staff</span><span class="chip">${o.ventures.length} venture${o.ventures.length === 1 ? '' : 's'}</span><span class="chip">${o.pending_requests.length} waiting on you</span></div>
      <h2>Run the company</h2>
      <div class="chips"><button class="btn go" id="b-step">Run one step</button><button class="btn" id="b-report">Read the board report</button></div>
      <h2>Run it from Claude Code <small>MCP</small></h2>
      <p class="lede">Open Claude Code in this repo; <code>.mcp.json</code> connects it to the company. Then say:</p>
      <div class="code">You're the CEO of Corporate AI. Start a venture for a monthly Assam tea box for offices in Gurugram, plan it, run steps until the queue is empty, and give me the board report.</div>
      <h2>Its tools</h2>
      <div class="code">company_overview  org_chart  start_venture  plan_venture
assign_task  list_tasks  run_step  read_work  set_task
verify_contact  board_report</div>`)
    return
  }
  if (inside === 'lobby') {
    const pending = S.requests.filter(r => r.status === 'pending'), decided = S.requests.filter(r => r.status !== 'pending')
    const rails = S.events.filter(e => e.type === 'rail').reverse()
    setHTML(box, `<p class="kicker">Ground floor</p><h1>Lobby</h1>
      <p class="lede">Every department has its own floor. Ventures come in here, money waits here for you, and every message that leaves the building is checked here first.</p>
      <h2>Directory <small>Assign by id</small></h2>
      <ul class="dir">${S.floors.map(f => { const h = f.people.find(p => p.head) || f.people[0]; return `<li data-level="${f.id}" style="cursor:pointer"><span class="d">${f.id === 'office' ? '·' : num(f.id)}</span><span>${esc(NAME[f.id] || f.name)}${f.id === 'office' ? ` (${esc(h.name)})` : ''}</span><span class="h">${esc(f.people.map(p => p.id).join(' '))}</span></li>` }).join('')}</ul>
      <h2>The company</h2>
      <p class="lede">25 AI staff, led by an AI CEO. Contacts are verified on their source page, every message says it comes from an AI, and the company never pays: costs come to you.</p>
      <h2>Ventures <small>${S.ventures.length}</small></h2>
      ${S.ventures.map(v => `<div class="card"><b>${esc(v.id)}</b> ${esc(v.idea)} <span class="state ${v.status === 'running' ? 'doing' : ''}">${esc(v.status)}</span>${v.plan ? `<p class="lede" style="margin:6px 0 0;font-size:13px">${esc(v.plan)}</p>` : ''}</div>`).join('') || '<div class="emptybox">No ventures yet. Start one above.</div>'}
      <h2>Needs your decision <small>The company never pays</small></h2>
      ${[...pending, ...decided.reverse()].map(r => `<div class="card req ${r.status === 'pending' ? '' : 'decided'}">
        ${r.kind === 'spend' ? `<div class="amt">${inr(r.amount_inr)}</div><div>to <b>${esc(r.payee)}</b></div>` : '<div class="amt">Decision</div>'}
        <div style="margin-top:4px">${esc(r.reason)}</div>
        <div style="color:var(--faint);font-size:12.5px;margin-top:4px">${esc(r.id)} · asked by ${esc(r.by_name)}${r.status !== 'pending' ? ` · <b>${esc(r.status)}</b>` : ''}</div>
        ${r.status === 'pending' ? `<div class="acts"><button class="btn go" data-approve="${esc(r.id)}">Approve</button><button class="btn no" data-decline="${esc(r.id)}">Decline</button></div>` : ''}
      </div>`).join('') || '<div class="emptybox">Nothing waiting.</div>'}
      <h2>Outreach drafts <small>Verified on the source page</small></h2>
      ${[...S.messages].reverse().map(m => `<div class="card msg">
        <div><b>${m.channel === 'call' ? 'Call' : 'Email'} to ${esc(m.to_name)}</b> <code>${esc(m.to)}</code></div>
        <div class="ev">Found on <a href="${esc(m.source_url)}" target="_blank" rel="noopener">${esc(m.source_url)}</a>${m.evidence ? `: “${esc(m.evidence)}”` : ''}</div>
        <pre>${esc(m.body)}</pre></div>`).join('') || '<div class="emptybox">No outreach yet.</div>'}
      <h2>Rails <small>What the code stopped</small></h2>
      ${rails.slice(0, 12).map(e => `<div class="card rail-hit"><div class="rule">${esc(RULE[e.rule] || 'Rail')}</div>${esc(e.text)}</div>`).join('') || '<div class="emptybox">Nothing blocked yet.</div>'}`)
    return
  }
  const floor = floorOf(inside); if (!floor) return
  const n = num(inside)
  setHTML(box, `<p class="kicker">Floor ${n} · ${floor.people.length} Claude agent${floor.people.length > 1 ? 's' : ''}</p>
    <h1>${esc(NAME[inside] || floor.name)}</h1>
    <div class="chips"><span class="chip mono">${esc(floor.people.map(p => p.id).join(', '))}</span><span class="chip">Rails on</span></div>
    <h2>The team</h2>
    ${floor.people.map(p => {
      const mine = S.tasks.filter(t => t.assignee === p.id)
      const doing = mine.find(t => t.status === 'doing'), waiting = mine.filter(t => t.status === 'todo').length
      const now = doing ? `<div class="now working">Working on ${esc(doing.id)}: ${esc(doing.title)}</div>` : waiting ? `<div class="now waiting">${waiting} task${waiting > 1 ? 's' : ''} waiting</div>` : '<div class="now">Free for work</div>'
      return `<div class="card person ${p.head ? 'head' : ''}"><div class="avatar">${esc(p.name[0])}</div><div>
        <div class="who"><b>${esc(p.name)}</b><span>${esc(p.title)}</span></div>
        <div class="handle">id: ${esc(p.id)}</div>${now}
        <span class="chip small">Claude Sonnet · medium · ${p.done} done</span></div></div>`
    }).join('')}`)
}

function renderAfter() {
  const box = $('#p-after'); if (!box) return
  if (!inside || ['lobby', 'terrace'].includes(inside) || !S) { setHTML(box, ''); return }
  const ts = tasksOn(inside)
  const prog = ts.filter(t => ['todo', 'doing', 'blocked', 'failed'].includes(t.status)), done = ts.filter(t => t.status === 'done')
  const list = tab === 'done' ? [...done].reverse() : prog
  const ids = new Set(floorOf(inside)?.people.map(p => p.id))
  const acts = S.events.filter(e => ids.has(e.who) || (e.task && ts.some(t => t.id === e.task))).slice(-10).reverse()
  setHTML(box, `<div class="tabs" role="tablist">
      <button role="tab" data-tab="progress" aria-selected="${tab === 'progress'}">In progress (${prog.length})</button>
      <button role="tab" data-tab="done" aria-selected="${tab === 'done'}">Done (${done.length})</button></div>
    ${list.length ? list.map(t => `<div class="card task" data-task="${esc(t.id)}">
      <div class="t"><span class="state ${esc(t.status)}">${esc(t.status)}</span>${esc(t.id)} ${esc(t.title)}</div>
      <div class="m">${esc(t.assignee_name)} · ${esc(t.priority)}${t.deps.length ? ` · after ${esc(t.deps.join(', '))}` : ''} · from ${esc(t.by_name)}</div>
      ${t.summary ? `<div class="s">${esc(t.summary)}</div>` : ''}</div>`).join('') : `<div class="emptybox">${tab === 'done' ? 'Nothing done yet.' : 'Nothing in progress. Give them something above.'}</div>`}
    <h2>Activity</h2>
    ${acts.length ? `<ul class="act">${acts.map(e => `<li><b>${esc(ago(e.at))}</b> ${esc(e.text)}</li>`).join('')}</ul>` : '<div class="emptybox">No activity yet.</div>'}
    <h2>Documents</h2>
    ${done.length ? done.map(t => `<div class="card doc" data-task="${esc(t.id)}"><b>${esc(t.title)}</b><span>${esc(t.assignee_name)}, ${esc(t.id)}</span></div>`).join('') : '<div class="emptybox">No documents yet.</div>'}`)
}

function render() {
  if (!S) return
  const today = new Date(); today.setHours(0, 0, 0, 0)
  $('#s-working').textContent = S.tasks.filter(t => t.status === 'doing').length
  $('#s-steps').textContent = S.events.filter(e => e.type === 'step' && e.at >= today.getTime()).length
  $('#s-drafts').textContent = S.messages.length
  $('#s-rails').textContent = S.events.filter(e => e.type === 'rail').length
  $('#autopilot').checked = S.autopilot
  const d = deptOf(), busy = {}
  for (const t of S.tasks) if (t.status === 'doing') busy[d[t.assignee]] = true
  building?.setBusy(busy)
  renderLevels(); renderLive(); renderAfter()
  const b = $('#b-step'); if (b) { b.disabled = !!S.busy; b.textContent = S.busy ? 'Working…' : 'Run one step' }
}

async function refresh() {
  try { S = await api('/api/state'); render() } catch { /* server restarting */ }
}

// ---------- Going in and out ----------
function enter(id) {
  if (building) building.enter(id); else show(id)
  if (!S) return
}
function leave() { if (building) building.exit(); else show(null) }

// ---------- Events ----------
document.addEventListener('click', async (e) => {
  const lvl = e.target.closest('[data-level]')
  if (lvl) { e.preventDefault(); return enter(lvl.dataset.level) }
  const pr = e.target.closest('[data-priority]')
  if (pr) { priority = pr.dataset.priority; document.querySelectorAll('[data-priority]').forEach(b => b.setAttribute('aria-pressed', b === pr)); return }
  const tb = e.target.closest('[data-tab]')
  if (tb) { tab = tb.dataset.tab; return renderAfter() }
  const dec = e.target.closest('[data-approve],[data-decline]')
  if (dec) { await api('/api/decide', { id: dec.dataset.approve || dec.dataset.decline, approve: !!dec.dataset.approve }); return refresh() }
  const t = e.target.closest('[data-task]')
  if (t) {
    const x = await api(`/api/task?id=${encodeURIComponent(t.dataset.task)}`)
    return modal(`<p class="kicker" style="margin-top:0">${esc(x.assignee_name)} · ${esc(x.status)}</p><h1 style="margin:0 0 8px;font-size:26px">${esc(x.id)} ${esc(x.title)}</h1>${x.detail ? `<p style="color:var(--muted)">${esc(x.detail)}</p>` : ''}${x.output ? md(x.output.deliverable) : '<p style="color:var(--faint)">Not done yet.</p>'}`)
  }
  if (e.target.closest('#b-report') || e.target.closest('#meeting')) {
    const r = await api('/api/report')
    return modal(`<p class="kicker" style="margin-top:0">Board meeting, chaired by your CEO</p>${md(r.report)}`)
  }
  if (e.target.closest('#b-step')) {
    e.target.disabled = true
    const p = api('/api/step', {}); setTimeout(refresh, 300)
    const r = await p
    if (r.ok === false) modal(`<h1 style="font-size:22px;margin:0 0 6px">Nothing to run</h1><p style="color:var(--muted)">${esc(r.reason)}</p>`)
    return refresh()
  }
  if (e.target.closest('#crumb-home')) { e.preventDefault(); return leave() }
})
document.addEventListener('submit', async (e) => {
  e.preventDefault()
  const f = e.target, data = Object.fromEntries(new FormData(f)), btn = f.querySelector('.give')
  btn.disabled = true
  if (f.id === 'f-venture') {
    $('#n-venture').textContent = 'The chief of staff is planning it…'
    const r = await api('/api/venture', data)
    $('#n-venture').textContent = r.ok === false ? r.reason : `Planned ${r.plan.tasks.filter(x => x.ok).length} tasks across the floors.`
    if (r.ok !== false) f.reset()
  }
  if (f.id === 'f-work') {
    const r = await api('/api/assign', { ...data, priority })
    const n = $('#n-work')
    n.className = `note ${r.ok === false ? 'bad' : ''}`
    n.textContent = r.ok === false ? `Refused by the rails: ${r.reason}` : `${r.task.id} is on their list.`
    if (r.ok !== false) { f.querySelector('[name=title]').value = ''; f.querySelector('[name=detail]').value = '' }
  }
  btn.disabled = false
  await refresh()
  if (f.id === 'f-venture' && inside === 'lobby') { const msg = $('#n-venture')?.textContent; renderForm(); if ($('#n-venture')) $('#n-venture').textContent = msg }
})
$('#back').addEventListener('click', leave)
$('#autopilot').addEventListener('change', (e) => api('/api/autopilot', { on: e.target.checked }).then(refresh))
addEventListener('keydown', (e) => {
  if (e.target.closest('textarea,select,input:not([type=checkbox])') || $('#modal').open) return
  if (e.key === 'Escape' && inside) return leave()
  if (e.key === 'Enter' && !inside) return enter(focusId)
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
    const d = e.key === 'ArrowUp' ? 1 : -1
    if (inside) { const i = LEVELS.indexOf(inside) + d; if (i >= 0 && i < LEVELS.length) enter(LEVELS[i]) }
    else building?.step(d)
  }
})

// Deep links: /#lobby, /#finance, /#terrace go straight in.
const fromHash = () => { const id = location.hash.slice(1); if (LEVELS.includes(id) && id !== inside) enter(id) }
addEventListener('hashchange', fromHash)

refresh().then(fromHash)
setInterval(refresh, 2000)
