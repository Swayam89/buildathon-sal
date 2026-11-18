// Safety rails, enforced in code. Agents propose; these functions decide.
// Nothing here trusts what a model says about itself.
import { person, STAFF } from './org.js'

// ---------- 1. Contacts must be real: printed on the page the agent cites ----------

export const emailsIn = (text) =>
  [...new Set([...String(text).matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)].map(m => m[0].toLowerCase()))]
    .filter(e => !/\.(png|jpe?g|gif|svg|webp)$/.test(e))

// Digits only, without the +91 country code or a trunk 0, so "+91 98765 43210" and "098765-43210" match.
export const phoneKey = (p) => String(p).replace(/\D/g, '').replace(/^91(?=\d{10}$)/, '').replace(/^0+/, '')

export function phonesIn(text) {
  const out = new Set()
  for (const m of String(text).matchAll(/\+?\d[\d\s().-]{6,16}\d/g)) {
    const k = phoneKey(m[0])
    if (k.length >= 8 && k.length <= 12) out.add(k)
  }
  return [...out]
}

// Turn HTML into plain text so hidden markup can't smuggle in addresses.
export const pageText = (html) => String(html)
  .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/gi, ' ')
  .replace(/<a[^>]+href="(mailto:|tel:)([^"]+)"[^>]*>/gi, ' $2 ')
  .replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ')

// Fetch a page once per check, with a timeout. fetchImpl is injectable for tests and the offline demo.
export async function fetchPage(url, fetchImpl = fetch) {
  if (!/^https?:\/\//i.test(String(url))) throw new Error('source must be an http(s) URL')
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(10000), headers: { 'user-agent': 'corporate-ai-verifier/0.1' } })
  if (!res.ok) throw new Error(`source returned HTTP ${res.status}`)
  return pageText(await res.text())
}

// Check one contact against its source page. Returns { ok, reason, evidence }.
export async function verifyContact({ email = '', phone = '', source_url = '' }, { fetchImpl = fetch } = {}) {
  if (!email && !phone) return { ok: false, reason: 'no email or phone given' }
  if (!source_url) return { ok: false, reason: 'no source page given: contacts must come from a page that shows them' }
  let text
  try { text = await fetchPage(source_url, fetchImpl) } catch (e) { return { ok: false, reason: `could not read the source page (${e.message})` } }
  const around = (needle) => {
    const i = text.toLowerCase().indexOf(needle.toLowerCase())
    return i < 0 ? '' : text.slice(Math.max(0, i - 60), i + needle.length + 60).trim()
  }
  if (email) {
    if (!emailsIn(text).includes(email.toLowerCase())) return { ok: false, reason: `${email} is not on ${source_url}` }
  }
  if (phone) {
    const k = phoneKey(phone)
    if (!phonesIn(text).some(p => p === k || p.endsWith(k) || k.endsWith(p))) return { ok: false, reason: `${phone} is not on ${source_url}` }
  }
  return { ok: true, reason: 'found on the source page', evidence: around(email || String(phone).slice(-5)) }
}

// ---------- 2. Money: the company never pays. Costs become requests for the owner ----------

const MONEY = /(₹|rs\.?\s?\d|inr\s?\d|\$\s?\d|\bpay(ment)?\b|\bpurchase\b|\bbuy\b|\bsubscribe\b|\bdeposit\b|\btransfer\b|\binvoice\b)/i
// Words in an outbound message that would commit the company to spending or signing.
const COMMIT = /\b(we will pay|we('ll| will) (buy|purchase|order|sign)|please (send|share) (the )?invoice|confirm(ing)? (the |our )?order|advance payment|bank details|upi id)\b/i

export function moneyCheck(text) {
  return { mentions_money: MONEY.test(String(text)), commits: COMMIT.test(String(text)) }
}

// ---------- 3. Honest outreach: every message says it's from an AI; cold email can opt out ----------

export function discloseAI(body, { company, sender, cold = true }) {
  let out = String(body).trim()
  if (!/\bAI\b/.test(out)) out += `\n\n${sender.name} is an AI assistant at ${company}.`
  if (cold && !/unsubscribe/i.test(out)) out += '\nReply "unsubscribe" and we won\'t write again.'
  return out
}

// ---------- 4. Content is data, not orders ----------

const INJECTION = /(ignore (all |any |the )?(previous|prior|above) (instructions|rules)|disregard (your|the) (rules|instructions)|you are now|system prompt|reveal your (prompt|instructions)|send (all|every) (files|data|money)|transfer (the )?funds)/i
export const looksLikeInjection = (text) => INJECTION.test(String(text))

// ---------- 5. A sane task graph ----------

export const LIMITS = { tasks_per_venture: 40, subtask_depth: 3, handoffs_per_step: 3, requests_per_step: 2, outreach_per_step: 3 }

const words = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w)))
const STOP = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'our', 'your', 'about', 'list', 'make', 'draft', 'write'])
export function similarity(a, b) {
  const x = words(a), y = words(b)
  if (!x.size || !y.size) return 0
  let both = 0
  for (const w of x) if (y.has(w)) both++
  return both / (x.size + y.size - both)
}

// Is a proposed task a near-copy of one that's still open (or done) in the same venture?
export function duplicateOf(title, assignee, tasks) {
  return tasks.find(t => t.status !== 'cancelled' && (similarity(t.title, title) >= 0.6 || (t.assignee === assignee && similarity(t.title, title) >= 0.45))) || null
}

const depthOf = (task, byId) => { let d = 0, t = task; while (t?.parent && d < 10) { t = byId(t.parent); d++ } return d }

// Would adding edges task -> deps create a cycle?
export function makesCycle(taskId, deps, byId) {
  const seen = new Set()
  const walk = (id) => {
    if (id === taskId) return true
    if (seen.has(id)) return false
    seen.add(id)
    return (byId(id)?.deps || []).some(walk)
  }
  return deps.some(walk)
}

// Check a proposed new task. Returns { ok, reason, duplicate }.
export function checkNewTask({ title, assignee, deps = [], parent = null }, { ventureTasks, byId }) {
  if (!String(title || '').trim()) return { ok: false, reason: 'a task needs a title' }
  if (!person(assignee)) return { ok: false, reason: `no one called "${assignee}" works here (valid ids: ${STAFF.map(p => p.id).join(', ')})` }
  if (ventureTasks.length >= LIMITS.tasks_per_venture) return { ok: false, reason: `this venture already has ${LIMITS.tasks_per_venture} tasks; finish some first` }
  const missing = deps.filter(d => !byId(d))
  if (missing.length) return { ok: false, reason: `unknown dependency ${missing.join(', ')}` }
  if (parent && depthOf(byId(parent), byId) + 1 >= LIMITS.subtask_depth) return { ok: false, reason: `sub-tasks can only go ${LIMITS.subtask_depth} levels deep; do the work instead of splitting it again` }
  const dup = duplicateOf(title, assignee, ventureTasks)
  if (dup) return { ok: false, reason: `duplicate of ${dup.id} "${dup.title}"`, duplicate: dup }
  return { ok: true }
}
