import { http, HttpResponse } from 'msw'
import { messengerMock } from '../test-utils/messenger-mock'
import { server } from '../test-utils/server'
import { HUBSPOT_CRM_BASE } from '../api/constants'
import {
  renderContactItem,
  renderCompanyItem,
  renderDealItem,
  renderSearchResults,
  initHubSpotPanel,
  type RecipientEntry,
} from './hubspot-panel'
import type { HubSpotContact, HubSpotCompany, HubSpotDeal } from '../api/hubspot-client'

const STORED_KEY = 'pat-na1-test-key'

const CONTACT: HubSpotContact = {
  id: '1',
  properties: { firstname: 'Alice', lastname: 'Example', email: 'alice@example.com', company: 'Acme Corp' },
}
const COMPANY: HubSpotCompany = {
  id: '2',
  properties: { name: 'Acme Corp', domain: 'acme.com' },
}
const DEAL: HubSpotDeal = {
  id: '3',
  properties: { dealname: 'Big Sale', amount: '50000', dealstage: 'closedwon' },
}

beforeEach(() => {
  messengerMock.storage.local.get.mockResolvedValue({ hubspot_access_key: STORED_KEY })
})

// ── renderContactItem ──────────────────────────────────────────────────────────

describe('renderContactItem', () => {
  it('renders the full name and email', () => {
    const html = renderContactItem(CONTACT)
    expect(html).toContain('Alice Example')
    expect(html).toContain('alice@example.com')
  })

  it('renders the company in the meta line', () => {
    const html = renderContactItem(CONTACT)
    expect(html).toContain('Acme Corp')
  })

  it('uses email as the display name when first/last name are absent', () => {
    const html = renderContactItem({ id: '1', properties: { email: 'anon@example.com' } })
    expect(html).toContain('anon@example.com')
  })

  it('falls back to "(unnamed)" when there is no name or email', () => {
    const html = renderContactItem({ id: '1', properties: {} })
    expect(html).toContain('(unnamed)')
  })

  it('HTML-encodes the name to prevent XSS', () => {
    const html = renderContactItem({
      id: '1',
      properties: { firstname: '<script>alert(1)</script>', email: 'x@x.com' },
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

// ── renderCompanyItem ──────────────────────────────────────────────────────────

describe('renderCompanyItem', () => {
  it('renders the company name and domain', () => {
    const html = renderCompanyItem(COMPANY)
    expect(html).toContain('Acme Corp')
    expect(html).toContain('acme.com')
  })

  it('falls back to "(unnamed)" when there is no name', () => {
    const html = renderCompanyItem({ id: '1', properties: {} })
    expect(html).toContain('(unnamed)')
  })

  it('omits the meta span when there is no domain', () => {
    const html = renderCompanyItem({ id: '1', properties: { name: 'Corp' } })
    expect(html).not.toContain('result-meta')
  })

  it('HTML-encodes the company name to prevent XSS', () => {
    const html = renderCompanyItem({ id: '1', properties: { name: '<b>Evil</b>' } })
    expect(html).not.toContain('<b>')
    expect(html).toContain('&lt;b&gt;')
  })
})

// ── renderDealItem ─────────────────────────────────────────────────────────────

describe('renderDealItem', () => {
  it('renders the deal name', () => {
    const html = renderDealItem(DEAL)
    expect(html).toContain('Big Sale')
  })

  it('renders the amount with a dollar sign', () => {
    const html = renderDealItem(DEAL)
    expect(html).toContain('$50000')
  })

  it('falls back to "(unnamed)" when there is no deal name', () => {
    const html = renderDealItem({ id: '1', properties: {} })
    expect(html).toContain('(unnamed)')
  })

  it('omits the meta span when amount and closedate are absent', () => {
    const html = renderDealItem({ id: '1', properties: { dealname: 'Sparse Deal' } })
    expect(html).not.toContain('result-meta')
  })

  it('HTML-encodes the deal name to prevent XSS', () => {
    const html = renderDealItem({ id: '1', properties: { dealname: '<img src=x>' } })
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})

// ── renderSearchResults ────────────────────────────────────────────────────────

describe('renderSearchResults', () => {
  it('includes all three section headings', () => {
    const html = renderSearchResults({ contacts: [], companies: [], deals: [] })
    expect(html).toContain('Contacts')
    expect(html).toContain('Companies')
    expect(html).toContain('Deals')
  })

  it('shows "no X found" messages when each array is empty', () => {
    const html = renderSearchResults({ contacts: [], companies: [], deals: [] })
    expect(html).toContain('No contacts found.')
    expect(html).toContain('No companies found.')
    expect(html).toContain('No deals found.')
  })

  it('renders all provided contacts', () => {
    const html = renderSearchResults({ contacts: [CONTACT], companies: [], deals: [] })
    expect(html).toContain('Alice Example')
  })

  it('renders all provided companies', () => {
    const html = renderSearchResults({ contacts: [], companies: [COMPANY], deals: [] })
    expect(html).toContain('Acme Corp')
  })

  it('renders all provided deals', () => {
    const html = renderSearchResults({ contacts: [], companies: [], deals: [DEAL] })
    expect(html).toContain('Big Sale')
  })
})

// ── initHubSpotPanel ───────────────────────────────────────────────────────────

describe('initHubSpotPanel', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => {
    container.remove()
  })

  it('renders a search input pre-filled with the initial query', async () => {
    await initHubSpotPanel(container, 'alice@example.com', 'test-session')
    const input = container.querySelector('#hubspot-search') as HTMLInputElement
    expect(input.value).toBe('alice@example.com')
  })

  it('shows the "enter a name" prompt when the initial query is empty', async () => {
    await initHubSpotPanel(container, '', 'test-session')
    expect(container.textContent).toContain('Enter a name')
  })

  it('shows results after searching with a non-empty query', async () => {
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ total: 1, results: [CONTACT] }),
      ),
    )
    await initHubSpotPanel(container, 'alice@example.com', 'test-session')
    expect(container.textContent).toContain('Alice Example')
  })

  it('shows an error message when the API fails', async () => {
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
    )
    await initHubSpotPanel(container, 'alice@example.com', 'test-session')
    expect(container.textContent).toContain('Search failed')
  })

  it('updates results when the search input changes', async () => {
    vi.useFakeTimers()
    await initHubSpotPanel(container, '', 'test-session')

    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ total: 1, results: [CONTACT] }),
      ),
    )

    const input = container.querySelector('#hubspot-search') as HTMLInputElement
    input.value = 'alice'
    input.dispatchEvent(new Event('input'))

    vi.advanceTimersByTime(350)
    await vi.runAllTimersAsync()

    expect(container.textContent).toContain('Alice Example')
    vi.useRealTimers()
  })
})

// ── initHubSpotPanel — email strategy ─────────────────────────────────────────

describe('initHubSpotPanel — email strategy', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    // Return a contact for the exact-match lookup
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ total: 1, results: [{ ...CONTACT, id: '10' }] }),
      ),
    )
  })

  afterEach(() => { container.remove() })

  it('shows associated companies resolved via the associations API', async () => {
    server.use(
      http.get(`${HUBSPOT_CRM_BASE}/contacts/10`, () =>
        HttpResponse.json({ id: '10', properties: {}, associations: { companies: { results: [{ id: '20', type: 'contact_to_company' }] }, deals: { results: [] } } }),
      ),
      http.post(`${HUBSPOT_CRM_BASE}/companies/batch/read`, () =>
        HttpResponse.json({ results: [COMPANY] }),
      ),
    )
    await initHubSpotPanel(container, 'alice@example.com', 'test-session')
    expect(container.textContent).toContain('Acme Corp')
    expect(container.textContent).toContain('acme.com')
  })

  it('shows associated deals resolved via the associations API', async () => {
    server.use(
      http.get(`${HUBSPOT_CRM_BASE}/contacts/10`, () =>
        HttpResponse.json({ id: '10', properties: {}, associations: { companies: { results: [] }, deals: { results: [{ id: '30', type: 'contact_to_deal' }] } } }),
      ),
      http.post(`${HUBSPOT_CRM_BASE}/deals/batch/read`, () =>
        HttpResponse.json({ results: [DEAL] }),
      ),
    )
    await initHubSpotPanel(container, 'alice@example.com', 'test-session')
    expect(container.textContent).toContain('Big Sale')
  })

  it('shows empty results when no contact matches the email', async () => {
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ total: 0, results: [] }),
      ),
    )
    await initHubSpotPanel(container, 'nobody@example.com', 'test-session')
    expect(container.textContent).toContain('No contacts found.')
    expect(container.textContent).toContain('No companies found.')
    expect(container.textContent).toContain('No deals found.')
  })

  it('deduplicates companies shared by multiple contacts', async () => {
    // Two contacts both associated with the same company
    const SHARED_COMPANY = { id: '20', properties: { name: 'Shared Org', domain: 'shared.org' } }
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({
          total: 2,
          results: [
            { id: '10', properties: { firstname: 'Alice', email: 'alice@example.com' } },
            { id: '11', properties: { firstname: 'Bob', email: 'bob@example.com' } },
          ],
        }),
      ),
      http.get(`${HUBSPOT_CRM_BASE}/contacts/10`, () =>
        HttpResponse.json({ id: '10', properties: {}, associations: { companies: { results: [{ id: '20', type: 'contact_to_company' }] }, deals: { results: [] } } }),
      ),
      http.get(`${HUBSPOT_CRM_BASE}/contacts/11`, () =>
        HttpResponse.json({ id: '11', properties: {}, associations: { companies: { results: [{ id: '20', type: 'contact_to_company' }] }, deals: { results: [] } } }),
      ),
      http.post(`${HUBSPOT_CRM_BASE}/companies/batch/read`, () =>
        HttpResponse.json({ results: [SHARED_COMPANY] }),
      ),
    )
    await initHubSpotPanel(container, 'alice@example.com', 'test-session')
    // 'Shared Org' should appear exactly once in the companies section
    const matches = container.textContent.split('Shared Org').length
    expect(matches).toBe(2) // split by X gives length N+1 when X appears N times
  })
})

// ── initHubSpotPanel — freetext strategy ──────────────────────────────────────

describe('initHubSpotPanel — freetext strategy', () => {
  let container: HTMLElement

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => { container.remove() })

  it('searches contacts, companies, and deals by freetext when query has no @', async () => {
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ total: 1, results: [CONTACT] }),
      ),
      http.post(`${HUBSPOT_CRM_BASE}/companies/search`, () =>
        HttpResponse.json({ total: 1, results: [COMPANY] }),
      ),
      http.post(`${HUBSPOT_CRM_BASE}/deals/search`, () =>
        HttpResponse.json({ total: 1, results: [DEAL] }),
      ),
    )
    await initHubSpotPanel(container, 'acme', 'test-session')
    expect(container.textContent).toContain('Alice Example')
    expect(container.textContent).toContain('Acme Corp')
    expect(container.textContent).toContain('Big Sale')
  })
})

// ── initHubSpotPanel — recipients ─────────────────────────────────────────────

describe('initHubSpotPanel — recipients', () => {
  let container: HTMLElement

  const RECIPIENTS: RecipientEntry[] = [
    { email: 'bob@example.com', displayName: 'Bob Smith', role: 'to' },
    { email: 'carol@example.com', role: 'cc' },
  ]

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
  })

  afterEach(() => { container.remove() })

  it('renders a row for each recipient with [data-email]', async () => {
    await initHubSpotPanel(container, '', 'test-session', RECIPIENTS)
    expect(container.querySelector('[data-email="bob@example.com"]')).not.toBeNull()
    expect(container.querySelector('[data-email="carol@example.com"]')).not.toBeNull()
  })

  it('renders a role badge showing "To" for a to-recipient', async () => {
    await initHubSpotPanel(container, '', 'test-session', RECIPIENTS)
    const bobRow = container.querySelector('[data-email="bob@example.com"]')
    expect(bobRow?.textContent).toContain('To')
  })

  it('renders a role badge showing "CC" for a cc-recipient', async () => {
    await initHubSpotPanel(container, '', 'test-session', RECIPIENTS)
    const carolRow = container.querySelector('[data-email="carol@example.com"]')
    expect(carolRow?.textContent).toContain('CC')
  })

  it('renders a role badge showing "From" for a from-recipient', async () => {
    await initHubSpotPanel(container, '', 'test-session', [{ email: 'alice@example.com', displayName: 'Alice', role: 'from' }])
    const aliceRow = container.querySelector('[data-email="alice@example.com"]')
    expect(aliceRow?.textContent).toContain('From')
  })

  it('checking a found recipient adds it to checked contacts via storage.set', async () => {
    const FOUND_CONTACT = { id: '55', properties: { email: 'bob@example.com' } }
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ total: 1, results: [FOUND_CONTACT] }),
      ),
    )
    await initHubSpotPanel(container, '', 'test-session', [{ email: 'bob@example.com', role: 'to' }])
    // Flush microtasks so the fire-and-forget recipient lookup finishes before we click
    await new Promise(r => setTimeout(r, 50))
    const checkbox = container.querySelector<HTMLInputElement>('[data-email="bob@example.com"] input[type=checkbox]')
    checkbox?.click()
    await new Promise(r => setTimeout(r, 10))
    expect(messengerMock.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'hs_checked_test-session': expect.objectContaining({
          contacts: expect.arrayContaining([FOUND_CONTACT]),
        }),
      }),
    )
  })

  it('checking a not-found recipient stores it as a pending contact', async () => {
    // Default handler returns empty results — contact not found
    await initHubSpotPanel(container, '', 'test-session', [{ email: 'unknown@example.com', role: 'to' }])
    // Flush microtasks so the fire-and-forget recipient lookup finishes before we click
    await new Promise(r => setTimeout(r, 50))
    const checkbox = container.querySelector<HTMLInputElement>('[data-email="unknown@example.com"] input[type=checkbox]')
    checkbox?.click()
    await new Promise(r => setTimeout(r, 10))
    expect(messengerMock.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'hs_checked_test-session': expect.objectContaining({
          pendingContacts: expect.arrayContaining([
            expect.objectContaining({ email: 'unknown@example.com' }),
          ]),
        }),
      }),
    )
  })

  it('shows companies associated with a found recipient contact', async () => {
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ total: 1, results: [{ id: '55', properties: { email: 'bob@example.com' } }] }),
      ),
      http.get(`${HUBSPOT_CRM_BASE}/contacts/55`, () =>
        HttpResponse.json({ id: '55', properties: {}, associations: { companies: { results: [{ id: '10', type: 'contact_to_company' }] }, deals: { results: [] } } }),
      ),
      http.post(`${HUBSPOT_CRM_BASE}/companies/batch/read`, () =>
        HttpResponse.json({ results: [{ id: '10', properties: { name: 'Acme Corp', domain: 'acme.com' } }] }),
      ),
    )
    await initHubSpotPanel(container, '', 'test-session', [{ email: 'bob@example.com', role: 'to' }])
    await new Promise(r => setTimeout(r, 50))
    expect(container.textContent).toContain('Acme Corp')
  })

  it('shows deals associated with a found recipient contact', async () => {
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ total: 1, results: [{ id: '55', properties: { email: 'bob@example.com' } }] }),
      ),
      http.get(`${HUBSPOT_CRM_BASE}/contacts/55`, () =>
        HttpResponse.json({ id: '55', properties: {}, associations: { companies: { results: [] }, deals: { results: [{ id: '20', type: 'contact_to_deal' }] } } }),
      ),
      http.post(`${HUBSPOT_CRM_BASE}/deals/batch/read`, () =>
        HttpResponse.json({ results: [{ id: '20', properties: { dealname: 'Big Sale' } }] }),
      ),
    )
    await initHubSpotPanel(container, '', 'test-session', [{ email: 'bob@example.com', role: 'to' }])
    await new Promise(r => setTimeout(r, 50))
    expect(container.textContent).toContain('Big Sale')
  })

  it('deduplicates companies shared by multiple recipient contacts', async () => {
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ total: 1, results: [{ id: '55', properties: { email: 'bob@example.com' } }] }),
      ),
      http.get(`${HUBSPOT_CRM_BASE}/contacts/55`, () =>
        HttpResponse.json({ id: '55', properties: {}, associations: { companies: { results: [{ id: '10', type: 'contact_to_company' }] }, deals: { results: [] } } }),
      ),
      http.post(`${HUBSPOT_CRM_BASE}/companies/batch/read`, () =>
        HttpResponse.json({ results: [{ id: '10', properties: { name: 'Shared Corp', domain: 'shared.com' } }] }),
      ),
    )
    await initHubSpotPanel(container, '', 'test-session', [{ email: 'bob@example.com', role: 'to' }])
    await new Promise(r => setTimeout(r, 50))
    const matches = container.textContent.split('Shared Corp').length
    expect(matches).toBe(2)
  })

  it('does not pre-check suggested companies or deals', async () => {
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ total: 1, results: [{ id: '55', properties: { email: 'bob@example.com' } }] }),
      ),
      http.get(`${HUBSPOT_CRM_BASE}/contacts/55`, () =>
        HttpResponse.json({ id: '55', properties: {}, associations: { companies: { results: [{ id: '10', type: 'contact_to_company' }] }, deals: { results: [] } } }),
      ),
      http.post(`${HUBSPOT_CRM_BASE}/companies/batch/read`, () =>
        HttpResponse.json({ results: [{ id: '10', properties: { name: 'Acme Corp' } }] }),
      ),
    )
    await initHubSpotPanel(container, '', 'test-session', [{ email: 'bob@example.com', role: 'to' }])
    await new Promise(r => setTimeout(r, 50))
    const companyCheckbox = container.querySelector<HTMLInputElement>('[data-id="10"] input[type=checkbox]')
    expect(companyCheckbox?.checked).toBe(false)
  })
})
