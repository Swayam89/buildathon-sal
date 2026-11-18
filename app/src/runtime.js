// Shared setup for the MCP server, the web dashboard and the demo:
// one data file, one brain choice, one company.
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Store } from './store.js'
import { Company } from './company.js'
import { ClaudeBrain } from './brain.js'
import { scriptedBrain, demoFetch } from '../demo/script.js'

export const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), '..')
export const DATA_FILE = process.env.CORP_DATA || join(APP_DIR, 'data', 'company.json')

// CORP_BRAIN=scripted runs the offline demo script (no network, same result every time).
export function makeCompany({ file = DATA_FILE, brain = process.env.CORP_BRAIN || 'claude' } = {}) {
  const store = new Store(file)
  const offline = brain === 'scripted'
  return new Company({
    store,
    brain: offline ? scriptedBrain() : new ClaudeBrain(),
    fetchImpl: offline ? demoFetch : fetch,
    name: process.env.COMPANY_NAME || 'Corporate AI',
  })
}
