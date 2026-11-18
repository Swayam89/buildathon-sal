// The brain behind each staff agent.
// ClaudeBrain runs Claude Code headless with a JSON schema, so every answer is structured.
// ScriptedBrain replays fixed answers, so the demo and the tests run offline and the same way every time.
import { spawn } from 'node:child_process'

export class ClaudeBrain {
  constructor({ bin = process.env.CLAUDE_BIN || 'claude', model = process.env.CLAUDE_MODEL || 'sonnet', effort = 'medium', tools = ['WebSearch', 'WebFetch'], timeoutMs = 240000 } = {}) {
    Object.assign(this, { bin, model, effort, tools, timeoutMs })
    this.name = `claude:${model}`
  }

  think({ system, prompt, schema, tools = this.tools }) {
    const args = ['-p', prompt, '--output-format', 'json', '--model', this.model, '--effort', this.effort,
      '--no-session-persistence', '--json-schema', JSON.stringify(schema), '--append-system-prompt', system,
      '--tools', tools.join(',')]
    if (tools.length) args.push('--allowedTools', ...tools)
    return new Promise((resolve, reject) => {
      const child = spawn(this.bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
      let out = '', err = ''
      const timer = setTimeout(() => { child.kill('SIGTERM'); reject(new Error('the brain took too long')) }, this.timeoutMs)
      child.stdout.on('data', d => { out += d })
      child.stderr.on('data', d => { err += d })
      child.on('error', e => { clearTimeout(timer); reject(e) })
      child.on('close', code => {
        clearTimeout(timer)
        try {
          const r = JSON.parse(out)
          if (r.is_error || !r.structured_output) return reject(new Error(r.result || `brain failed (${r.subtype || code})`))
          resolve(r.structured_output)
        } catch { reject(new Error(`brain gave no usable answer (exit ${code}) ${err.slice(0, 200)}`)) }
      })
    })
  }
}

// answers: (call) => object, or an array consumed in order.
export class ScriptedBrain {
  constructor(answers) { this.answers = answers; this.calls = []; this.name = 'scripted' }
  async think(call) {
    this.calls.push(call)
    const a = typeof this.answers === 'function' ? await this.answers(call) : this.answers.shift()
    if (a instanceof Error) throw a
    if (!a) throw new Error('scripted brain has no answer left')
    return structuredClone(a)
  }
}
