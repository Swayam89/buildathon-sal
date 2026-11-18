// The org chart: who works at the company, what each person does, who they report to.
// JARVIS is the CEO (an outside agent that drives the company through MCP).
// Everyone else is a staff agent the company runs itself.

export const CEO = { id: 'jarvis', name: 'JARVIS', title: 'Chief executive officer', dept: 'board' }

export const CHIEF_OF_STAFF = {
  id: 'chief', name: 'Naina', title: 'Chief of staff', dept: 'office', head: true,
  duties: 'Turns the CEO\'s plan into tasks, routes work to the right department and writes the daily report.',
}

// One head and two staff per department.
const DEPTS = [
  ['finance', 'Finance', [
    ['cfo', 'Rhea', 'Chief financial officer', 'Budgets, pricing and unit economics.'],
    ['accountant', 'Varun', 'Accountant', 'Cost sheets, invoices and tax notes.'],
    ['analyst', 'Ishaan', 'Financial analyst', 'Market sizing and forecasts.'],
  ]],
  ['operations', 'Operations', [
    ['coo', 'Arnav', 'Chief operating officer', 'Processes, suppliers and launch plans.'],
    ['projects', 'Tanvi', 'Project manager', 'Timelines, checklists and follow-ups.'],
    ['purchase', 'Rehan', 'Purchase executive', 'Finding suppliers and comparing quotes.'],
  ]],
  ['marketing', 'Marketing', [
    ['cmo', 'Sia', 'Chief marketing officer', 'Positioning, brand and campaigns.'],
    ['content', 'Kiara', 'Content writer', 'Copy, posts and landing pages.'],
    ['growth', 'Vivaan', 'Growth marketer', 'Channels, experiments and metrics.'],
  ]],
  ['sales', 'Sales', [
    ['sales_head', 'Aditi', 'Head of sales', 'Sales strategy and pipeline.'],
    ['leads', 'Reyansh', 'Lead researcher', 'Finding real prospects with verified contacts.'],
    ['deals', 'Myra', 'Account executive', 'Outreach emails and follow-ups.'],
  ]],
  ['tech', 'Tech and product', [
    ['cto', 'Advait', 'Chief technology officer', 'Product scope and technical plan.'],
    ['dev', 'Anika', 'Developer', 'Prototypes and technical specs.'],
    ['design', 'Shaurya', 'Designer', 'User flows and wireframes.'],
  ]],
  ['support', 'Customer support', [
    ['support_head', 'Ira', 'Head of support', 'Support playbooks and FAQs.'],
    ['help', 'Dhruv', 'Support agent', 'Answering customers.'],
    ['feedback', 'Saanvi', 'Feedback analyst', 'Turning feedback into product notes.'],
  ]],
  ['hr', 'HR and admin', [
    ['hr_head', 'Avni', 'Head of HR', 'Hiring plans and policies.'],
    ['careers', 'Krish', 'Recruiter', 'Job descriptions and candidate lists.'],
    ['admin', 'Jiya', 'Admin executive', 'Paperwork and scheduling.'],
  ]],
  ['legal', 'Legal and compliance', [
    ['legal_head', 'Mira', 'Head of legal', 'Company structure and risk.'],
    ['contracts', 'Parth', 'Contracts associate', 'Contract drafts and terms.'],
    ['compliance', 'Navya', 'Compliance officer', 'Registrations, GST and licences.'],
  ]],
]

export const DEPARTMENTS = DEPTS.map(([id, name, people]) => ({
  id, name,
  people: people.map(([pid, pname, title, duties], i) => ({ id: pid, name: pname, title, duties, dept: id, head: i === 0 })),
}))

export const STAFF = [CHIEF_OF_STAFF, ...DEPARTMENTS.flatMap(d => d.people)]

export const person = (id) => STAFF.find(p => p.id === id) || null
export const department = (id) => DEPARTMENTS.find(d => d.id === id) || null
export const headOf = (deptId) => department(deptId)?.people.find(p => p.head) || null

// Who someone reports to: staff -> their head, heads -> chief of staff, chief -> CEO.
export function managerOf(id) {
  const p = person(id)
  if (!p) return null
  if (p.id === CHIEF_OF_STAFF.id) return CEO
  if (p.head) return CHIEF_OF_STAFF
  return headOf(p.dept)
}

// A short org chart that fits in a prompt.
export function orgBrief() {
  return [
    `CEO: ${CEO.name}. Chief of staff: ${CHIEF_OF_STAFF.name} (id ${CHIEF_OF_STAFF.id}).`,
    ...DEPARTMENTS.map(d => `${d.name} (${d.id}): ` + d.people.map(p => `${p.name}, ${p.title} (id ${p.id}): ${p.duties}`).join(' | ')),
  ].join('\n')
}
