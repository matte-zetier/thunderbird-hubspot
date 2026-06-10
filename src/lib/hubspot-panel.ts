import { HubSpotClient } from '../api/hubspot-client'
import type { HubSpotContact, HubSpotCompany, HubSpotDeal, CheckedItems, PendingContact } from '../api/hubspot-client'
import { escapeHtml } from './escape-html'
import { getCheckedItems, setCheckedItems } from './checked-items'

export interface HubSpotSearchResults {
  contacts: HubSpotContact[]
  companies: HubSpotCompany[]
  deals: HubSpotDeal[]
}

export interface CheckedIdSets {
  contacts: Set<string>
  companies: Set<string>
  deals: Set<string>
}

export interface RecipientEntry {
  email: string
  displayName?: string
  role: 'from' | 'to' | 'cc' | 'bcc'
}

interface RecipientState {
  entry: RecipientEntry
  contact?: HubSpotContact
  lookupDone: boolean
}

const DEBOUNCE_MS = 300

// ── Item renderers ─────────────────────────────────────────────────────────────

export function renderContactItem(contact: HubSpotContact, checked = false): string {
  const nameParts: string[] = []
  if (contact.properties.firstname) nameParts.push(contact.properties.firstname)
  if (contact.properties.lastname) nameParts.push(contact.properties.lastname)
  const name = nameParts.length > 0 ? nameParts.join(' ') : (contact.properties.email ?? '(unnamed)')
  const metaParts: string[] = []
  if (contact.properties.email) metaParts.push(contact.properties.email)
  if (contact.properties.company) metaParts.push(contact.properties.company)
  const meta = metaParts.join(' · ')
  return `<li class="result-item${checked ? ' pinned' : ''}" data-id="${escapeHtml(contact.id)}" data-type="contact">
    <label class="result-label">
      <input type="checkbox"${checked ? ' checked' : ''} />
      <span class="result-name">${escapeHtml(name)}</span>
    </label>
    ${meta ? `<span class="result-meta">${escapeHtml(meta)}</span>` : ''}
  </li>`
}

export function renderCompanyItem(company: HubSpotCompany, checked = false): string {
  const name = company.properties.name ?? '(unnamed)'
  const meta = company.properties.domain ?? ''
  return `<li class="result-item${checked ? ' pinned' : ''}" data-id="${escapeHtml(company.id)}" data-type="company">
    <label class="result-label">
      <input type="checkbox"${checked ? ' checked' : ''} />
      <span class="result-name">${escapeHtml(name)}</span>
    </label>
    ${meta ? `<span class="result-meta">${escapeHtml(meta)}</span>` : ''}
  </li>`
}

export function renderDealItem(deal: HubSpotDeal, checked = false): string {
  const name = deal.properties.dealname ?? '(unnamed)'
  const metaParts: string[] = []
  if (deal.properties.amount) metaParts.push(`$${escapeHtml(deal.properties.amount)}`)
  if (deal.properties.closedate) metaParts.push(`Closes ${escapeHtml(formatDate(deal.properties.closedate))}`)
  const meta = metaParts.join(' · ')
  return `<li class="result-item${checked ? ' pinned' : ''}" data-id="${escapeHtml(deal.id)}" data-type="deal">
    <label class="result-label">
      <input type="checkbox"${checked ? ' checked' : ''} />
      <span class="result-name">${escapeHtml(name)}</span>
    </label>
    ${meta ? `<span class="result-meta">${meta}</span>` : ''}
  </li>`
}

export function renderSearchResults(
  results: HubSpotSearchResults,
  checkedIds: CheckedIdSets = { contacts: new Set(), companies: new Set(), deals: new Set() },
): string {
  return [
    renderSection('Contacts', results.contacts.map(c => renderContactItem(c, checkedIds.contacts.has(c.id)))),
    renderSection('Companies', results.companies.map(c => renderCompanyItem(c, checkedIds.companies.has(c.id)))),
    renderSection('Deals', results.deals.map(d => renderDealItem(d, checkedIds.deals.has(d.id)))),
  ].join('')
}

// ── Recipient item renderer ────────────────────────────────────────────────────

function renderRecipientItem(state: RecipientState, isChecked: boolean): string {
  const { entry, contact, lookupDone } = state
  const { email, displayName, role } = entry

  const roleLabelMap: Record<RecipientEntry['role'], string> = { from: 'From', to: 'To', cc: 'CC', bcc: 'BCC' }
  const roleLabel = roleLabelMap[role]

  const displayNameOrEmail = displayName || email
  const liClasses = ['result-item', 'recipient-item']
  if (isChecked) liClasses.push('pinned')

  const checkedAttr = isChecked ? ' checked' : ''

  let metaHtml = ''
  if (!lookupDone) {
    metaHtml = `<span class="result-meta muted">Looking up…</span>`
  } else if (isChecked && !contact) {
    metaHtml = `<span class="result-meta not-in-hs">Will be added to HubSpot</span>`
  } else if (!isChecked && !contact) {
    metaHtml = `<span class="result-meta muted">Not in HubSpot</span>`
  } else if (contact && displayName) {
    metaHtml = `<span class="result-meta">${escapeHtml(email)}</span>`
  }

  return `<li class="${escapeHtml(liClasses.join(' '))}" data-email="${escapeHtml(email)}" data-role="${escapeHtml(role)}">
    <label class="result-label">
      <input type="checkbox"${checkedAttr} />
      <div>
        <div class="result-name-row">
          <span class="result-name">${escapeHtml(displayNameOrEmail)}</span>
          <span class="role-badge role-${escapeHtml(role)}">${escapeHtml(roleLabel)}</span>
        </div>
        ${metaHtml}
      </div>
    </label>
  </li>`
}

// ── Panel initialiser ──────────────────────────────────────────────────────────

export async function initHubSpotPanel(
  container: HTMLElement,
  initialQuery: string,
  sessionKey: string,
  recipients?: RecipientEntry[],
): Promise<void> {
  // Load persisted checked state for this session
  const stored = await getCheckedItems(sessionKey)
  const checkedContacts = new Map<string, HubSpotContact>(stored.contacts.map(c => [c.id, c]))
  const checkedCompanies = new Map<string, HubSpotCompany>(stored.companies.map(c => [c.id, c]))
  const checkedDeals = new Map<string, HubSpotDeal>(stored.deals.map(d => [d.id, d]))
  const pendingContacts = new Map<string, PendingContact>(
    (stored.pendingContacts ?? []).map(p => [p.email, p]),
  )

  // Build recipient states
  const recipientStates = new Map<string, RecipientState>()
  if (recipients) {
    for (const entry of recipients) {
      recipientStates.set(entry.email, { entry, lookupDone: false })
    }
  }

  // Auto-populated from recipient contact lookups (shown without search, not pre-checked)
  const suggestedCompanies = new Map<string, HubSpotCompany>()
  const suggestedDeals = new Map<string, HubSpotDeal>()

  let lastSearchResults: HubSpotSearchResults | null = null

  container.innerHTML = `
    <div class="search-box">
      <input id="hubspot-search" type="text" placeholder="Search HubSpot…" value="${escapeHtml(initialQuery)}" />
    </div>
    <div id="hubspot-results"><p class="muted">Searching…</p></div>
  `

  if (
    !container.querySelector<HTMLInputElement>('#hubspot-search') ||
    !container.querySelector<HTMLElement>('#hubspot-results')
  ) return
  // Query again now that we've verified presence; TypeScript narrows these to non-null
  const searchInput = container.querySelector<HTMLInputElement>('#hubspot-search') as HTMLInputElement
  const resultsDiv = container.querySelector<HTMLElement>('#hubspot-results') as HTMLElement

  function checkedIdSets(): CheckedIdSets {
    return {
      contacts: new Set(checkedContacts.keys()),
      companies: new Set(checkedCompanies.keys()),
      deals: new Set(checkedDeals.keys()),
    }
  }

  function isRecipientChecked(email: string): boolean {
    for (const contact of checkedContacts.values()) {
      if (contact.properties.email === email) return true
    }
    return pendingContacts.has(email)
  }

  function rerender(): void {
    if (recipientStates.size > 0) {
      resultsDiv.innerHTML = renderWithRecipients()
      return
    }
    if (lastSearchResults === null) {
      const hasChecked =
        checkedContacts.size > 0 || checkedCompanies.size > 0 || checkedDeals.size > 0
      if (!hasChecked) {
        resultsDiv.innerHTML = '<p class="muted">Enter a name, email, or domain to search.</p>'
        return
      }
    }
    const merged = mergeResults(
      { contacts: [...checkedContacts.values()], companies: [...checkedCompanies.values()], deals: [...checkedDeals.values()] },
      lastSearchResults ?? { contacts: [], companies: [], deals: [] },
    )
    resultsDiv.innerHTML = renderSearchResults(merged, checkedIdSets())
  }

  function renderWithRecipients(): string {
    // Collect recipient emails for deduplication
    const recipientEmails = new Set(recipientStates.keys())

    // Build recipient rows
    const recipientRows = [...recipientStates.values()].map(state =>
      renderRecipientItem(state, isRecipientChecked(state.entry.email)),
    )

    const ulClass = recipientStates.size > 5 ? 'result-list recipients-scroll' : 'result-list'
    const recipientListHtml = `<ul class="${ulClass}">${recipientRows.join('')}</ul>`
    const contactsSectionItems: string[] = [`<div class="recipient-rows">${recipientListHtml}</div>`]

    // Additional non-recipient contacts from search/pinned (deduplicated)
    const additionalContacts = [
      ...checkedContacts.values(),
      ...(lastSearchResults?.contacts ?? []),
    ].filter(c => !recipientEmails.has(c.properties.email ?? ''))
    const seenIds = new Set<string>()
    const dedupedContacts: HubSpotContact[] = []
    for (const c of additionalContacts) {
      if (!seenIds.has(c.id)) {
        seenIds.add(c.id)
        dedupedContacts.push(c)
      }
    }
    if (dedupedContacts.length > 0) {
      const additionalRows = dedupedContacts.map(c => renderContactItem(c, checkedContacts.has(c.id)))
      contactsSectionItems.push(`<ul class="result-list">${additionalRows.join('')}</ul>`)
    }

    const totalContactCount = recipientStates.size + dedupedContacts.length
    const contactsSection = `<section>
      <h2>Contacts <span class="count">${totalContactCount}</span></h2>
      ${contactsSectionItems.join('')}
    </section>`

    // Companies and Deals — show when there are checked items, suggestions, or search results
    let companiesSection = ''
    let dealsSection = ''

    if (checkedCompanies.size > 0 || suggestedCompanies.size > 0 || lastSearchResults !== null) {
      const companies = mergeById(
        [...checkedCompanies.values()],
        mergeById([...suggestedCompanies.values()], lastSearchResults?.companies ?? []),
      )
      companiesSection = renderSection('Companies', companies.map(c => renderCompanyItem(c, checkedCompanies.has(c.id))))
    }

    if (checkedDeals.size > 0 || suggestedDeals.size > 0 || lastSearchResults !== null) {
      const deals = mergeById(
        [...checkedDeals.values()],
        mergeById([...suggestedDeals.values()], lastSearchResults?.deals ?? []),
      )
      dealsSection = renderSection('Deals', deals.map(d => renderDealItem(d, checkedDeals.has(d.id))))
    }

    return contactsSection + companiesSection + dealsSection
  }

  function persistChecked(): void {
    const items: CheckedItems = {
      contacts: [...checkedContacts.values()],
      companies: [...checkedCompanies.values()],
      deals: [...checkedDeals.values()],
    }
    if (pendingContacts.size > 0) {
      items.pendingContacts = [...pendingContacts.values()]
    }
    void setCheckedItems(sessionKey, items)
  }

  function handleRecipientCheckboxChange(checked: boolean, email: string): void {
    const state = recipientStates.get(email)
    if (!state) return

    if (checked) {
      if (state.contact) {
        checkedContacts.set(state.contact.id, state.contact)
        pendingContacts.delete(email)
      } else if (state.lookupDone) {
        pendingContacts.set(email, buildPendingContact(email, state.entry.displayName))
      }
    } else {
      if (state.contact) {
        checkedContacts.delete(state.contact.id)
      }
      pendingContacts.delete(email)
    }

    rerender()
    persistChecked()
  }

  // Checkbox event delegation
  resultsDiv.addEventListener('change', (e) => {
    const target = e.target
    if (!(target instanceof HTMLInputElement) || target.type !== 'checkbox') return
    const li = target.closest('li.result-item')
    if (!li) return

    const email = li.getAttribute('data-email')
    const isRecipientRow = email !== null && li.hasAttribute('data-role')

    if (isRecipientRow) {
      handleRecipientCheckboxChange(target.checked, email)
      return
    }

    const id = li.getAttribute('data-id')
    const type = li.getAttribute('data-type')
    if (!id || !type) return

    if (target.checked) {
      const sr = lastSearchResults ?? { contacts: [], companies: [], deals: [] }
      if (type === 'contact') {
        const item = sr.contacts.find(c => c.id === id) ?? checkedContacts.get(id)
        if (item) checkedContacts.set(id, item)
      } else if (type === 'company') {
        const item = sr.companies.find(c => c.id === id) ?? checkedCompanies.get(id) ?? suggestedCompanies.get(id)
        if (item) checkedCompanies.set(id, item)
      } else if (type === 'deal') {
        const item = sr.deals.find(d => d.id === id) ?? checkedDeals.get(id) ?? suggestedDeals.get(id)
        if (item) checkedDeals.set(id, item)
      }
    } else {
      if (type === 'contact') checkedContacts.delete(id)
      else if (type === 'company') checkedCompanies.delete(id)
      else if (type === 'deal') checkedDeals.delete(id)
    }

    rerender()
    persistChecked()
  })

  // Initial search
  const setAndRender = (results: HubSpotSearchResults | null): void => {
    lastSearchResults = results
    rerender()
  }

  await runSearch(resultsDiv, initialQuery, setAndRender)

  // Kick off recipient lookups in background (progressive updates)
  if (recipientStates.size > 0) {
    const client = new HubSpotClient()
    void Promise.all(
      [...recipientStates.entries()].map(async ([email, state]) => {
        try {
          const contacts = await client.getContactsByEmail(email)
          const contact = contacts[0]
          if (contact) {
            state.contact = contact
            // Fetch associated companies and deals for auto-population
            const [companies, deals] = await Promise.all([
              client.getAssociatedCompanies(contact.id),
              client.getAssociatedDeals(contact.id),
            ])
            for (const c of companies) {
              if (!suggestedCompanies.has(c.id)) suggestedCompanies.set(c.id, c)
            }
            for (const d of deals) {
              if (!suggestedDeals.has(d.id)) suggestedDeals.set(d.id, d)
            }
            // Upgrade pending → real contact
            if (pendingContacts.has(email)) {
              pendingContacts.delete(email)
              checkedContacts.set(contact.id, contact)
            }
          }
        } catch {
          // Silently ignore lookup errors
        } finally {
          state.lookupDone = true
          rerender()
        }
      }),
    )
  }

  // Debounced live search
  let debounceTimer: ReturnType<typeof setTimeout> | undefined
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      void runSearch(resultsDiv, searchInput.value, setAndRender)
    }, DEBOUNCE_MS)
  })
}

// ── Internal helpers ───────────────────────────────────────────────────────────

async function runSearch(
  resultsEl: HTMLElement,
  query: string,
  onResults: (results: HubSpotSearchResults | null) => void,
): Promise<void> {
  const trimmed = query.trim()
  if (!trimmed) {
    onResults(null)
    return
  }
  resultsEl.innerHTML = '<p class="muted">Searching…</p>'
  try {
    const results = trimmed.includes('@')
      ? await searchByEmail(trimmed)
      : await searchByQuery(trimmed)
    onResults(results)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    resultsEl.innerHTML = `<p class="error">Search failed: ${escapeHtml(message)}</p>`
  }
}

async function searchByEmail(email: string): Promise<HubSpotSearchResults> {
  const client = new HubSpotClient()
  const contacts = await client.getContactsByEmail(email)
  if (contacts.length === 0) return { contacts: [], companies: [], deals: [] }

  const [companiesNested, dealsNested] = await Promise.all([
    Promise.all(contacts.map(c => client.getAssociatedCompanies(c.id))),
    Promise.all(contacts.map(c => client.getAssociatedDeals(c.id))),
  ])

  return {
    contacts,
    companies: deduplicateById(companiesNested.flat()),
    deals: deduplicateById(dealsNested.flat()),
  }
}

async function searchByQuery(query: string): Promise<HubSpotSearchResults> {
  const client = new HubSpotClient()
  const [contacts, companies, deals] = await Promise.all([
    client.searchContacts(query),
    client.searchCompanies(query),
    client.searchDeals(query),
  ])
  return { contacts, companies, deals }
}

function mergeResults(
  pinned: HubSpotSearchResults,
  search: HubSpotSearchResults,
): HubSpotSearchResults {
  return {
    contacts: mergeById(pinned.contacts, search.contacts),
    companies: mergeById(pinned.companies, search.companies),
    deals: mergeById(pinned.deals, search.deals),
  }
}

function mergeById<T extends { id: string }>(primary: T[], secondary: T[]): T[] {
  const seen = new Set<string>()
  const result: T[] = []
  for (const item of [...primary, ...secondary]) {
    if (!seen.has(item.id)) {
      seen.add(item.id)
      result.push(item)
    }
  }
  return result
}

function deduplicateById<T extends { id: string }>(items: T[]): T[] {
  return mergeById(items, [])
}

function renderSection(title: string, items: string[]): string {
  const count = items.length
  const body =
    count > 0
      ? `<ul class="result-list">${items.join('')}</ul>`
      : `<p class="muted">No ${title.toLowerCase()} found.</p>`
  return `<section>
    <h2>${title} <span class="count">${count}</span></h2>
    ${body}
  </section>`
}

function formatDate(value: string): string {
  const ts = Number(value)
  const date = Number.isNaN(ts) ? new Date(value) : new Date(ts)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString()
}

function buildPendingContact(email: string, displayName?: string): PendingContact {
  if (!displayName) return { email }
  const spaceIdx = displayName.indexOf(' ')
  if (spaceIdx !== -1) {
    return { email, firstName: displayName.slice(0, spaceIdx), lastName: displayName.slice(spaceIdx + 1) }
  }
  return { email, firstName: displayName }
}
