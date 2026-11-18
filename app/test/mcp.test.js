import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Talk to the real MCP server over stdio, the way Claude Code does.
function server() {
  const dir = mkdtempSync(join(tmpdir(), 'corp-mcp-'))
  const child = spawn(process.execPath, ['src/mcp.js'], { env: { ...process.env, CORP_DATA: join(dir, 'c.json'), CORP_BRAIN: 'scripted' } })
  let buf = '', id = 0
  const waiting = new Map()
  child.stdout.on('data', d => {
    buf += d
    let i
    while ((i = buf.indexOf('\n')) >= 0) { const msg = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1); waiting.get(msg.id)?.(msg); waiting.delete(msg.id) }
  })
  const call = (method, params) => new Promise(res => { id += 1; waiting.set(id, res); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n') })
  const tool = async (name, args = {}) => { const r = await call('tools/call', { name, arguments: args }); return { ...r.result, text: r.result.content[0].text } }
  return { call, tool, stop: () => child.kill() }
}

test('JARVIS can run the company end to end over MCP, and the rails hold', async () => {
  const s = server()
  try {
    const init = await s.call('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } })
    assert.equal(init.result.serverInfo.name, 'corporate-ai')
    const names = (await s.call('tools/list', {})).result.tools.map(t => t.name)
    assert.ok(names.includes('run_step') && names.includes('assign_task') && !names.includes('approve_spend'))

    assert.match((await s.tool('start_venture', { idea: 'Assam tea box' })).text, /"id": "V1"/)
    assert.match((await s.tool('plan_venture', { venture: 'V1' })).text, /Find Assam estates/)
    const dup = await s.tool('assign_task', { venture: 'V1', title: 'Find Assam estates selling small wholesale lots', assignee: 'leads' })
    assert.equal(dup.isError, true)
    assert.match(dup.text, /duplicate of T1/)

    const r = JSON.parse((await s.tool('run_step', { venture: 'V1' })).text)
    assert.equal(r.who, 'Rehan')
    assert.equal(r.outreach.length, 1)
    assert.match(r.outreach_blocked[0], /sales@brahmaputra-leaf.example is not on/)
    assert.match(r.handoffs_dropped[0], /duplicate/)

    assert.equal(JSON.parse((await s.tool('verify_contact', { email: 'wholesale@hillside-tea.example', source_url: 'https://hillside-tea.example/contact' })).text).ok, true)
    const report = (await s.tool('board_report', { venture: 'V1' })).text
    assert.match(report, /Needs your decision \(1\)[\s\S]*₹1450 to Hillside Tea Estate/)
    assert.match(report, /Rails \([1-9]/)
  } finally { s.stop() }
})
