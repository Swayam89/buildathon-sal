// Dashboard: polls /api/state and renders the company. Plain JS, no build step.
const $ = (s) => document.querySelector(s)
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const time = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`

async function api(path, body) {
  const res = await fetch(path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {})
  return res.json()
}

// A tiny Markdown renderer for deliverables (headings, lists, tables, bold, links). Escapes first.
function md(src) {
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>')
    .replace(/(https?:\/\/[^\s)|]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')
  const lines = String(src || '').split('\n'), out = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    if (/^\|/.test(l)) {
      const rows = []
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++])
      i--
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim())
      out.push('<table>' + rows.filter(r => !/^\|[\s:|-]+\|$/.test(r)).map((r, n) => `<tr>${cells(r).map(c => n ? `<td>${inline(c)}</td>` : `<th>${inline(c)}</th>`).join('')}</tr>`).join('') + '</table>')
    } else if (/^#{1,3} /.test(l)) { const h = l.match(/^#+/)[0].length; out.push(`<h${h}>${inline(l.slice(h + 1))}</h${h}>`) }
    else if (/^\s*([-*]|\d+\.) /.test(l)) out.push(`<li>${inline(l.replace(/^\s*([-*]|\d+\.) /, ''))}</li>`)
    else if (l.trim()) out.push(`<p>${inline(l)}</p>`)
  }
  return `<div class="md">${out.join('')}</div>`
}

function modal(html) { $('#modal-body').innerHTML = html; $('#modal').showModal() }

let S = null

function render(s) {
  S = s
  $('#brain').textContent = s.brain === 'scripted' ? 'Offline demo brain' : `Brain: ${s.brain}`
  $('#busy').hidden = !s.busy
  $('#busy').textContent = s.busy || ''
  $('#step').disabled = !!s.busy
  $('#autopilot').checked = s.autopilot

  // Ventures
  $('#ventures').innerHTML = s.ventures.map(v => `<div class="venture"><b>${esc(v.id)}</b> ${esc(v.idea)} <span class="pill">${esc(v.status)}</span>${v.plan ? `<div class="plan">${esc(v.plan)}</div>` : ''}</div>`).join('')

  // Stats
  const t = s.tasks
  const pending = s.requests.filter(r => r.status === 'pending')
  const rails = s.events.filter(e => e.type === 'rail')
  $('#stats').innerHTML = [
    ['Staff', s.overview.staff, ''],
    ['Tasks done', t.filter(x => x.status === 'done').length, 'green'],
    ['In the queue', t.filter(x => ['todo', 'doing'].includes(x.status)).length, ''],
    ['Waiting on you', pending.length, 'amber'],
    ['Rails blocked', rails.length, 'red'],
    ['Verified outreach', s.messages.length, 'green'],
  ].map(([l, n, c]) => `<div class="stat ${c}"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('')

  // Building
  $('#floors').innerHTML = s.floors.map(f => `<div class="floor"><div class="floor-name"><span>${esc(f.name)}</span></div><div class="people">${
    f.people.map(p => `<div class="person ${p.now?.status || ''}" title="${esc(p.title)}: ${esc(p.duties)}"><span class="dot"></span><span class="who">${esc(p.name)}</span><span class="what">${p.now ? esc(p.now.title) : esc(p.title)}</span>${p.done ? `<span class="done-n">${p.done} done</span>` : ''}</div>`).join('')
  }</div></div>`).join('')

  // Task board
  const col = (list) => list.length ? list.map(x => `<div class="task ${x.status} ${x.priority}" data-task="${esc(x.id)}">
      <div class="t">${esc(x.id)} ${esc(x.title)}</div>
      <div class="m">${esc(x.assignee_name)}${x.priority !== 'normal' ? ` · ${x.priority}` : ''}${x.deps.length ? ` · after ${x.deps.join(', ')}` : ''}${x.parent ? ` · from ${x.by_name}` : ''}</div>
      ${x.summary ? `<div class="s">${esc(x.summary)}</div>` : ''}</div>`).join('') : '<p class="empty">Nothing here</p>'
  $('#col-todo').innerHTML = col(t.filter(x => x.status === 'todo'))
  $('#col-doing').innerHTML = col(t.filter(x => x.status === 'doing'))
  $('#col-done').innerHTML = col(t.filter(x => x.status === 'done').reverse())
  $('#col-stuck').innerHTML = col(t.filter(x => ['blocked', 'failed', 'cancelled'].includes(x.status)))

  // Owner decisions
  $('#requests').innerHTML = s.requests.length ? [...s.requests].reverse().map(r => `<div class="req ${r.status === 'pending' ? '' : 'decided'}">
      ${r.kind === 'spend' ? `<div class="amt">${inr(r.amount_inr)}</div><div>to <b>${esc(r.payee)}</b></div>` : '<div class="amt">Decision</div>'}
      <div>${esc(r.reason)}</div>
      <div class="m">${esc(r.id)} · asked by ${esc(r.by_name)}${r.status !== 'pending' ? ` · <b>${esc(r.status)}</b>` : ''}</div>
      ${r.status === 'pending' ? `<div class="acts"><button class="btn small" data-approve="${esc(r.id)}">Approve</button><button class="btn small red" data-decline="${esc(r.id)}">Decline</button></div>` : ''}
    </div>`).join('') : '<p class="empty">Nothing waiting.</p>'

  // Rails
  $('#rails-count').textContent = rails.length || ''
  const RULE = { verified_contact: 'Made-up contact', money: 'Money commitment', duplicate: 'Duplicate work', task_graph: 'Task graph', injection: 'Hidden instructions' }
  $('#rails').innerHTML = rails.length ? [...rails].reverse().slice(0, 12).map(e => `<div class="rail"><div class="rule">${esc(RULE[e.rule] || e.rule || 'Rail')}</div>${esc(e.text)}</div>`).join('') : '<p class="empty">Nothing blocked yet.</p>'

  // Outreach
  $('#messages').innerHTML = s.messages.length ? [...s.messages].reverse().map(m => `<div class="msg">
      <div class="to">${m.channel === 'call' ? 'Call' : 'Email'} to ${esc(m.to_name)} &lt;${esc(m.to)}&gt;</div>
      <div>${esc(m.subject)} · from ${esc(m.from_name)}</div>
      <div class="ev">Verified on <a href="${esc(m.source_url)}" target="_blank" rel="noopener">${esc(m.source_url)}</a>${m.evidence ? `: “${esc(m.evidence)}”` : ''}</div>
      <pre>${esc(m.body)}</pre></div>`).join('') : '<p class="empty">No outreach yet.</p>'

  // Activity
  $('#events').innerHTML = [...s.events].reverse().map(e => `<li class="${esc(e.type)}"><span class="time">${time(e.at)}</span><span class="type">${esc(e.type)}</span><span>${esc(e.text)}</span></li>`).join('')
}

async function refresh() {
  try { render(await api('/api/state')) } catch { /* server restarting */ }
}

// Actions
$('#venture-form').addEventListener('submit', async (e) => {
  e.preventDefault()
  const btn = e.submitter; btn.disabled = true; btn.textContent = 'Planning…'
  const r = await api('/api/venture', { idea: $('#idea').value, problem: $('#problem').value })
  btn.disabled = false; btn.textContent = 'Start venture'
  if (r.ok === false) alert(r.reason)
  else { $('#idea').value = ''; $('#problem').value = '' }
  refresh()
})
$('#step').addEventListener('click', async () => {
  $('#step').disabled = true
  const p = api('/api/step', {})
  setTimeout(refresh, 300)
  const r = await p
  if (r.ok === false) alert(r.reason)
  refresh()
})
$('#autopilot').addEventListener('change', (e) => api('/api/autopilot', { on: e.target.checked }).then(refresh))
$('#report').addEventListener('click', async () => modal(md((await api('/api/report')).report)))
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-task],[data-approve],[data-decline]')
  if (!el) return
  if (el.dataset.approve || el.dataset.decline) {
    await api('/api/decide', { id: el.dataset.approve || el.dataset.decline, approve: !!el.dataset.approve })
    return refresh()
  }
  const t = await api(`/api/task?id=${encodeURIComponent(el.dataset.task)}`)
  modal(`<h2>${esc(t.id)} ${esc(t.title)}</h2><p class="hint">${esc(t.assignee_name)} · ${esc(t.status)} · ${esc(t.priority)}</p>${t.detail ? `<p>${esc(t.detail)}</p>` : ''}${t.output ? md(t.output.deliverable) : '<p class="empty">Not done yet.</p>'}`)
})

refresh()
setInterval(refresh, 2000)
