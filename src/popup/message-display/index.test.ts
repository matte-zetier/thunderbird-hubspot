import { http, HttpResponse } from 'msw'
import { messengerMock } from '../../test-utils/messenger-mock'
import { server } from '../../test-utils/server'
import { HUBSPOT_CRM_BASE } from '../../api/constants'
import { init } from './index'

const MOCK_TAB = { id: 42 }

const MOCK_MESSAGE: MessageHeader = {
  id: 1,
  author: 'Alice Example <alice@example.com>',
  subject: 'Hello World',
  recipients: ['bob@example.com'],
  ccList: [],
  bccList: [],
  date: new Date('2024-01-01'),
  read: false,
  new: true,
  headerMessageId: '<test@example.com>',
  folder: { accountId: 'acct1', name: 'Inbox', path: '/Inbox' },
}

const STORED_KEY = 'pat-na1-test-key'

beforeEach(() => {
  document.body.innerHTML = '<div id="app"><p class="muted">Loading…</p></div>'
  messengerMock.tabs.query.mockResolvedValue([MOCK_TAB])
  messengerMock.messageDisplay.getDisplayedMessage.mockResolvedValue(MOCK_MESSAGE)
  // Default: configured
  messengerMock.storage.local.get.mockResolvedValue({ hubspot_access_key: STORED_KEY })
})

describe('init — not configured', () => {
  it('shows a settings prompt when no access key is stored', async () => {
    messengerMock.storage.local.get.mockResolvedValue({})
    await init()
    expect(document.getElementById('app')?.textContent).toContain('Personal Access Key')
    expect(document.getElementById('settings-btn')).not.toBeNull()
  })

  it('does not call getDisplayedMessage when not configured', async () => {
    messengerMock.storage.local.get.mockResolvedValue({})
    await init()
    expect(messengerMock.messageDisplay.getDisplayedMessage).not.toHaveBeenCalled()
  })

  it('opens the options page when the settings button is clicked', async () => {
    messengerMock.storage.local.get.mockResolvedValue({})
    await init()
    document.getElementById('settings-btn')?.click()
    expect(messengerMock.runtime.openOptionsPage).toHaveBeenCalled()
  })
})

describe('init — happy path', () => {
  it('renders the sender name and subject, and puts sender in the contacts list', async () => {
    await init()
    const text = document.getElementById('app')?.textContent ?? ''
    expect(text).toContain('Alice Example')
    expect(text).toContain('Hello World')
    expect(document.querySelector('[data-email="alice@example.com"][data-role="from"]')).not.toBeNull()
  })

  it('shows the sender in the contacts list with a From badge', async () => {
    await init()
    const fromRow = document.querySelector('[data-email="alice@example.com"][data-role="from"]')
    expect(fromRow).not.toBeNull()
    expect(fromRow?.textContent).toContain('From')
  })

  it('HTML-encodes the sender display name to prevent XSS', async () => {
    messengerMock.messageDisplay.getDisplayedMessage.mockResolvedValue({
      ...MOCK_MESSAGE,
      author: 'Alice & Bob <alice@example.com>',
    })
    await init()
    const html = document.getElementById('app')?.innerHTML ?? ''
    expect(html).toContain('&amp;')
    expect(html).not.toContain('Alice & Bob')
  })

  it('HTML-encodes the subject to prevent XSS', async () => {
    messengerMock.messageDisplay.getDisplayedMessage.mockResolvedValue({
      ...MOCK_MESSAGE,
      subject: '<img src=x onerror="alert(1)">',
    })
    await init()
    const html = document.getElementById('app')?.innerHTML ?? ''
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img')
  })
})

describe('init — HubSpot panel', () => {
  it('starts with an empty search input (not pre-filled with sender email)', async () => {
    await init()
    const input = document.getElementById('hubspot-search') as HTMLInputElement | null
    expect(input?.value).toBe('')
  })

  it('renders recipient rows in the contacts section when recipients are present', async () => {
    const CONTACT = { id: '1', properties: { firstname: 'Bob', email: 'bob@example.com' } }
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ total: 1, results: [CONTACT] }),
      ),
    )
    await init()
    // bob@example.com is in MOCK_MESSAGE.recipients, so a row should exist
    expect(document.querySelector('[data-email="bob@example.com"]')).not.toBeNull()
  })

  it('shows a search error when the user triggers a search that fails', async () => {
    vi.useFakeTimers()
    await init()
    // Override endpoint to fail for the typed search
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
    )
    const input = document.getElementById('hubspot-search') as HTMLInputElement | null
    if (input) {
      input.value = 'test query'
      input.dispatchEvent(new Event('input'))
      vi.advanceTimersByTime(350)
      await vi.runAllTimersAsync()
    }
    vi.useRealTimers()
    expect(document.getElementById('hubspot-results')?.textContent).toContain('Search failed')
  })
})

describe('init — Update CRM button', () => {
  it('renders the Update CRM button', async () => {
    await init()
    expect(document.getElementById('update-crm-btn')).not.toBeNull()
  })

  it('logs an engagement and shows success when contacts are checked', async () => {
    // Return a contact so it appears in results
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ total: 1, results: [{ id: '1', properties: { email: 'alice@example.com' } }] }),
      ),
    )
    // Pre-populate checked state for this session
    messengerMock.storage.local.get.mockImplementation((key: string) =>
      Promise.resolve(
        key === 'hs_checked_message_<test@example.com>'
          ? { 'hs_checked_message_<test@example.com>': { contacts: [{ id: '1', properties: {} }], companies: [], deals: [] } }
          : { hubspot_access_key: STORED_KEY },
      )
    )
    await init()
    document.getElementById('update-crm-btn')?.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(document.getElementById('crm-status')?.textContent).toContain('CRM updated')
  })

  it('shows an error message when no items are checked', async () => {
    await init()
    document.getElementById('update-crm-btn')?.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(document.getElementById('crm-status')?.textContent).toContain('Select at least one')
  })

  it('shows an error when the HubSpot API fails', async () => {
    messengerMock.storage.local.get.mockImplementation((key: string) =>
      Promise.resolve(
        key === 'hs_checked_message_<test@example.com>'
          ? { 'hs_checked_message_<test@example.com>': { contacts: [{ id: '1', properties: {} }], companies: [], deals: [] } }
          : { hubspot_access_key: STORED_KEY },
      )
    )
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/emails`, () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
    )
    await init()
    document.getElementById('update-crm-btn')?.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(document.getElementById('crm-status')?.textContent).toContain('Failed')
  })
})

describe('init — previously logged email', () => {
  it('fetches engagement items from HubSpot and pre-checks them', async () => {
    const ALICE = { id: '10', properties: { firstname: 'Alice', email: 'alice@example.com' } }
    // Storage returns: the log entry AND the pre-populated checked items (simulating setCheckedItems)
    messengerMock.storage.local.get.mockImplementation((key: string) =>
      Promise.resolve(
        key === 'hs_log_<test@example.com>'
          ? { 'hs_log_<test@example.com>': { engagementId: '999', loggedAt: 1000 } }
          : key === 'hs_checked_message_<test@example.com>'
            ? { 'hs_checked_message_<test@example.com>': { contacts: [ALICE], companies: [], deals: [] } }
            : { hubspot_access_key: STORED_KEY },
      )
    )
    server.use(
      http.get(`${HUBSPOT_CRM_BASE}/emails/999`, () =>
        HttpResponse.json({
          id: '999',
          properties: {},
          associations: {
            contacts: { results: [{ id: '10', type: 'email_to_contact' }] },
            companies: { results: [] },
            deals: { results: [] },
          },
        }),
      ),
      http.post(`${HUBSPOT_CRM_BASE}/contacts/batch/read`, () =>
        HttpResponse.json({ results: [ALICE] }),
      ),
    )
    await init()
    const checkedBoxes = document.querySelectorAll('input[type=checkbox]:checked')
    expect(checkedBoxes.length).toBeGreaterThan(0)
  })
})

describe('init — recipients panel', () => {
  it('renders a row for each recipient', async () => {
    await init()
    expect(document.querySelector('[data-email="bob@example.com"]')).not.toBeNull()
  })

  it('shows the display name when the address includes one', async () => {
    messengerMock.messageDisplay.getDisplayedMessage.mockResolvedValue({
      ...MOCK_MESSAGE,
      recipients: ['Bob Smith <bob@example.com>'],
    })
    await init()
    expect(document.querySelector('[data-email="bob@example.com"] .result-name')?.textContent).toBe('Bob Smith')
  })

  it('does not add recipients-scroll class for 5 or fewer recipients', async () => {
    messengerMock.messageDisplay.getDisplayedMessage.mockResolvedValue({
      ...MOCK_MESSAGE,
      recipients: ['a@a.com', 'b@b.com', 'c@c.com'],
    })
    await init()
    expect(document.querySelector('.recipients-scroll')).toBeNull()
  })

  it('adds recipients-scroll class when there are more than 5 recipients', async () => {
    messengerMock.messageDisplay.getDisplayedMessage.mockResolvedValue({
      ...MOCK_MESSAGE,
      recipients: ['a@a.com', 'b@b.com', 'c@c.com', 'd@d.com', 'e@e.com', 'f@f.com'],
    })
    await init()
    expect(document.querySelector('.recipients-scroll')).not.toBeNull()
  })

  it('adds the contact to checked items when a recipient is found in HubSpot', async () => {
    const CONTACT = { id: '5', properties: { email: 'bob@example.com' } }
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ total: 1, results: [CONTACT] }),
      ),
    )
    await init()
    // Flush microtasks so the fire-and-forget recipient lookup finishes before we click
    await new Promise(r => setTimeout(r, 50))
    const checkbox = document.querySelector<HTMLInputElement>('[data-email="bob@example.com"] input[type=checkbox]')
    checkbox?.click()
    await new Promise(r => setTimeout(r, 10))
    expect(messengerMock.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        'hs_checked_message_<test@example.com>': expect.objectContaining({
          contacts: expect.arrayContaining([CONTACT]),
        }),
      }),
    )
  })

  it('shows "Will be added to HubSpot" when the recipient is not found', async () => {
    await init()
    // Flush microtasks so the fire-and-forget recipient lookup finishes (returns empty) before we click
    await new Promise(r => setTimeout(r, 50))
    const checkbox = document.querySelector<HTMLInputElement>('[data-email="bob@example.com"] input[type=checkbox]')
    checkbox?.click()
    await new Promise(r => setTimeout(r, 10))
    const metaEl = document.querySelector('[data-email="bob@example.com"] .result-meta')
    expect(metaEl?.textContent).toBe('Will be added to HubSpot')
  })

  it('creates the contact in HubSpot when Update CRM is clicked', async () => {
    // Bob is not in HubSpot — checking him stores a pending contact
    messengerMock.storage.local.get.mockImplementation((key: string) =>
      Promise.resolve(
        key === 'hs_checked_message_<test@example.com>'
          ? { 'hs_checked_message_<test@example.com>': { contacts: [], companies: [], deals: [], pendingContacts: [{ email: 'bob@example.com' }] } }
          : { hubspot_access_key: STORED_KEY },
      ),
    )
    let createdBody: unknown
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts`, async ({ request }) => {
        createdBody = await request.json()
        return HttpResponse.json({ id: '77', properties: { email: 'bob@example.com' } }, { status: 201 })
      }),
    )
    await init()
    document.getElementById('update-crm-btn')?.click()
    await new Promise(r => setTimeout(r, 30))
    expect(createdBody).toMatchObject({ properties: { email: 'bob@example.com' } })
    expect(document.getElementById('crm-status')?.textContent).toContain('CRM updated')
  })

  it('pre-checks recipients whose emails match contacts already in checked items', async () => {
    messengerMock.storage.local.get.mockImplementation((key: string) =>
      Promise.resolve(
        key === 'hs_checked_message_<test@example.com>'
          ? { 'hs_checked_message_<test@example.com>': { contacts: [{ id: '5', properties: { email: 'bob@example.com' } }], companies: [], deals: [] } }
          : { hubspot_access_key: STORED_KEY },
      ),
    )
    await init()
    const checkbox = document.querySelector<HTMLInputElement>('[data-email="bob@example.com"] input[type=checkbox]')
    expect(checkbox?.checked).toBe(true)
  })
})

describe('init — empty / error states', () => {
  it('shows "No message selected" when no message is displayed', async () => {
    messengerMock.messageDisplay.getDisplayedMessage.mockResolvedValue(null)
    await init()
    expect(document.getElementById('app')?.textContent).toContain('No message selected.')
  })

  it('shows an error when no active tab is found', async () => {
    messengerMock.tabs.query.mockResolvedValue([])
    await init()
    expect(document.getElementById('app')?.textContent).toContain(
      'Could not identify active tab.',
    )
  })

  it('calls getDisplayedMessage with the correct tab id', async () => {
    await init()
    expect(messengerMock.messageDisplay.getDisplayedMessage).toHaveBeenCalledWith(
      MOCK_TAB.id,
    )
  })
})
