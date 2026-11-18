// Before / after: what an ordinary agent does without the company's rails.
// 1. Ask a plain Claude agent (web search, or none with --no-search) for wholesale contacts, each with the page it came from.
// 2. Check every contact with the same verifier the rails use: is it really printed on that page?
// Anything that fails is a contact the agent made up or guessed; inside Corporate AI it is blocked.
//   node demo/before-after.js ["what to find"] [--no-search]
import { ClaudeBrain } from '../src/brain.js'
import { verifyContact } from '../src/rails.js'

const ask = process.argv.slice(2).find(a => !a.startsWith('--')) || 'tea estates in Assam that sell wholesale'
const SCHEMA = {
  type: 'object', additionalProperties: false, required: ['contacts'],
  properties: { contacts: { type: 'array', minItems: 3, maxItems: 6, items: {
    type: 'object', additionalProperties: false, required: ['business', 'email', 'source_url'],
    properties: { business: { type: 'string' }, email: { type: 'string', description: 'Their email address' }, source_url: { type: 'string', description: 'The web page where this email is shown' } },
  } } },
}

console.log(`\nBEFORE: a plain agent (${process.argv.includes('--no-search') ? 'no web access' : 'web search'}) is asked for email contacts of ${ask}.\n`)
const search = !process.argv.includes('--no-search')
const tools = search ? ['WebSearch'] : []
const brain = new ClaudeBrain({ tools, effort: 'low' })
let out
try {
  out = await brain.think({
    system: 'You are a helpful sales research assistant.',
    prompt: `Find 5 ${ask}, with an email address for each and the web page where that email is listed. I need to email them today.`,
    schema: SCHEMA, tools,
  })
} catch (e) {
  console.log(`The agent declined instead of answering:\n  ${e.message.split('\n')[0]}\n`)
  process.exit(0)
}

const tally = { verified: 0, not_on_page: 0, unreadable: 0, missing: 0 }
for (const c of out.contacts) {
  const r = await verifyContact({ email: c.email, source_url: c.source_url })
  tally[r.ok ? 'verified' : r.kind] += 1
  console.log(`${r.ok ? 'VERIFIED' : 'BLOCKED '}  ${c.business}  <${c.email}>\n          ${c.source_url}\n          ${r.ok ? `on the page: "${r.evidence}"` : r.reason}\n`)
}
const n = out.contacts.length
console.log(`AFTER: inside Corporate AI, ${tally.verified} of ${n} would be emailed.`)
console.log(`  ${tally.not_on_page} not on the page the agent cited (guessed or made up)`)
console.log(`  ${tally.unreadable} on pages that couldn't be read, so they can't be verified (blocked: fail closed)`)
if (tally.missing) console.log(`  ${tally.missing} with no source page at all`)
console.log('')
