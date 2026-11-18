// JSON schemas the brain must answer in, plus a small checker
// (the brain is asked for the schema, and the code checks it again anyway).

const str = (description, extra = {}) => ({ type: 'string', description, ...extra })

export const PLAN = {
  type: 'object', additionalProperties: false, required: ['summary', 'tasks'],
  properties: {
    summary: str('Two or three sentences: the plan for this venture.'),
    tasks: {
      type: 'array', minItems: 2, maxItems: 8,
      items: {
        type: 'object', additionalProperties: false, required: ['key', 'title', 'detail', 'assignee', 'priority', 'after'],
        properties: {
          key: str('Short id for this task within the plan, like "t1".'),
          title: str('What to do, in under 10 words.'),
          detail: str('What a good result looks like.'),
          assignee: str('Staff id from the org chart.'),
          priority: { type: 'string', enum: ['urgent', 'normal', 'low'] },
          after: { type: 'array', items: { type: 'string' }, description: 'Keys of tasks that must finish first.' },
        },
      },
    },
  },
}

export const STEP = {
  type: 'object', additionalProperties: false, required: ['summary', 'status', 'deliverable', 'handoffs', 'requests', 'outreach'],
  properties: {
    summary: str('One sentence: what you did.'),
    status: { type: 'string', enum: ['done', 'blocked'], description: 'blocked only if you truly cannot proceed.' },
    deliverable: str('The work itself, in Markdown. Cite source URLs for facts.'),
    handoffs: {
      type: 'array', maxItems: 3, description: 'Follow-up work for colleagues. Only what is really needed.',
      items: { type: 'object', additionalProperties: false, required: ['title', 'detail', 'assignee'],
        properties: { title: str('Under 10 words.'), detail: str('What they need to do.'), assignee: str('Staff id.') } },
    },
    requests: {
      type: 'array', maxItems: 2, description: 'Anything that costs money or needs the owner to decide. The company never pays itself.',
      items: { type: 'object', additionalProperties: false, required: ['kind', 'amount_inr', 'payee', 'reason'],
        properties: { kind: { type: 'string', enum: ['spend', 'decision'] }, amount_inr: { type: 'number' }, payee: str('Who would be paid.'), reason: str('Why.') } },
    },
    outreach: {
      type: 'array', maxItems: 3, description: 'Emails or calls to real businesses. Each contact must be printed on source_url.',
      items: { type: 'object', additionalProperties: false, required: ['channel', 'to_name', 'email', 'phone', 'source_url', 'subject', 'body'],
        properties: {
          channel: { type: 'string', enum: ['email', 'call'] }, to_name: str('Business name.'),
          email: str('Email as printed on the page, or empty.'), phone: str('Phone as printed on the page, or empty.'),
          source_url: str('The page that shows this contact.'), subject: str('Email subject, or call purpose.'), body: str('The message.'),
        } },
    },
  },
}

// Minimal structural check: required keys present with the right basic types.
export function conforms(value, schema) {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false
    return (schema.required || []).every(k => k in value && conforms(value[k], schema.properties[k]))
  }
  if (schema.type === 'array') return Array.isArray(value) && value.every(v => conforms(v, schema.items))
  if (schema.type === 'string') return typeof value === 'string' && (!schema.enum || schema.enum.includes(value))
  if (schema.type === 'number') return typeof value === 'number' && Number.isFinite(value)
  return true
}
