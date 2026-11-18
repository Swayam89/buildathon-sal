// Shared setup for the MCP server, the web dashboard and the demo:
// one data file, one brain choice, one company.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Store } from './store.js'
import { Company } from './company.js'
import { ClaudeBrain } from './brain.js'
import { GeminiBrain } from './gemini.js'
import { scriptedBrain, demoFetch } from '../demo/script.js'

export const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
export const DATA_FILE = process.env.CORP_DATA || join(APP_DIR, 'data', 'company.json')

// app/.env holds GEMINI_API_KEY (git-ignored, never committed).
try { process.loadEnvFile(join(APP_DIR, '.env')) } catch { /* no .env: fine */ }

// Which brain runs the CEO and the 25 staff:
//   CORP_BRAIN=gemini    Google Gemini, free API key in app/.env (the default when a key is set)
//   CORP_BRAIN=claude    Claude Code on this machine, using its own sign-in
//   CORP_BRAIN=scripted  the offline stage demo: fixed answers, fake supplier pages, no network
export function brainChoice(explicit = process.env.CORP_BRAIN) {
  return explicit || (process.env.GEMINI_API_KEY ? 'gemini' : 'claude')
}

export function makeCompany({ file = DATA_FILE, brain = brainChoice() } = {}) {
  const store = new Store(file)
  const offline = brain === 'scripted'
  return new Company({
    store,
    brain: offline ? scriptedBrain() : brain === 'gemini' ? new GeminiBrain() : new ClaudeBrain(),
    fetchImpl: offline ? demoFetch : fetch,
    name: process.env.COMPANY_NAME || 'Corporate AI',
  })
}
