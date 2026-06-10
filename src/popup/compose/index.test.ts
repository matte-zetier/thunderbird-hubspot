import { http, HttpResponse } from 'msw'
import { messengerMock } from '../../test-utils/messenger-mock'
import { server } from '../../test-utils/server'
import { HUBSPOT_CRM_BASE } from '../../api/constants'
import { init } from './index'

const MOCK_TAB = { id: 7 }

const STORED_KEY = 'pat-na1-test-key'

beforeEach(() => {
  document.body.innerHTML = '<div id="app"><p class="muted">Loading…</p></div>'
  messengerMock.tabs.query.mockResolvedValue([MOCK_TAB])
  messengerMock.compose.getComposeDetails.mockResolvedValue({
    to: ['bob@example.com'],
    cc: [],
    bcc: [],
    subject: 'Test Subject',
  })
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

  it('does not call getComposeDetails when not configured', async () => {
    messengerMock.storage.local.get.mockResolvedValue({})
    await init()
    expect(messengerMock.compose.getComposeDetails).not.toHaveBeenCalled()
  })

  it('opens the options page when the settings button is clicked', async () => {
    messengerMock.storage.local.get.mockResolvedValue({})
    await init()
    document.getElementById('settings-btn')?.click()
    expect(messengerMock.runtime.openOptionsPage).toHaveBeenCalled()
  })
})

describe('init — happy path', () => {
  it('renders to: recipients as checkable rows', async () => {
    await init()
    expect(document.querySelector('[data-email="bob@example.com"][data-role="to"]')).not.toBeNull()
  })

  it('renders cc: and bcc: recipients with correct role badges', async () => {
    messengerMock.compose.getComposeDetails.mockResolvedValue({
      to: ['to@example.com'],
      cc: ['cc@example.com'],
      bcc: ['bcc@example.com'],
    })
    await init()
    expect(document.querySelector('[data-email="to@example.com"][data-role="to"]')).not.toBeNull()
    expect(document.querySelector('[data-email="cc@example.com"][data-role="cc"]')).not.toBeNull()
    expect(document.querySelector('[data-email="bcc@example.com"][data-role="bcc"]')).not.toBeNull()
  })

  it('shows the subject line', async () => {
    await init()
    expect(document.getElementById('app')?.textContent).toContain('Test Subject')
  })

  it('HTML-encodes recipient display names to prevent XSS', async () => {
    messengerMock.compose.getComposeDetails.mockResolvedValue({
      to: ['Jones & Smith <jones@example.com>'],
    })
    await init()
    const html = document.getElementById('app')?.innerHTML ?? ''
    expect(html).not.toContain('Jones & Smith')
    expect(html).toContain('Jones &amp; Smith')
  })
})

describe('init — HubSpot panel', () => {
  it('starts with an empty search input', async () => {
    await init()
    const input = document.getElementById('hubspot-search') as HTMLInputElement | null
    expect(input?.value).toBe('')
  })

  it('shows a recipient row per address with a role badge', async () => {
    messengerMock.compose.getComposeDetails.mockResolvedValue({
      to: ['alice@example.com'],
      cc: ['bob@example.com'],
      bcc: [],
    })
    await init()
    const aliceRow = document.querySelector('[data-email="alice@example.com"]')
    const bobRow = document.querySelector('[data-email="bob@example.com"]')
    expect(aliceRow?.textContent).toContain('To')
    expect(bobRow?.textContent).toContain('CC')
  })

  it('does not show the panel when there are no recipients', async () => {
    messengerMock.compose.getComposeDetails.mockResolvedValue({ to: [], cc: [], bcc: [] })
    await init()
    expect(document.getElementById('hubspot-search')).toBeNull()
  })

  it('logs an engagement and shows success when a recipient is checked', async () => {
    const CONTACT = { id: '1', properties: { email: 'bob@example.com' } }
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ total: 1, results: [CONTACT] }),
      ),
    )
    messengerMock.storage.local.get.mockImplementation((key: string) =>
      Promise.resolve(
        key === 'hs_checked_compose_7'
          ? { 'hs_checked_compose_7': { contacts: [CONTACT], companies: [], deals: [] } }
          : { hubspot_access_key: STORED_KEY },
      )
    )
    await init()
    expect(document.querySelector('[data-email="bob@example.com"] input[type=checkbox]')).not.toBeNull()
  })
})

describe('init — empty / error states', () => {
  it('shows "No recipients yet" when all recipient fields are empty', async () => {
    messengerMock.compose.getComposeDetails.mockResolvedValue({
      to: [],
      cc: [],
      bcc: [],
    })
    await init()
    expect(document.getElementById('app')?.textContent).toContain('No recipients yet.')
  })

  it('shows "No recipients yet" when recipient fields are absent', async () => {
    messengerMock.compose.getComposeDetails.mockResolvedValue({})
    await init()
    expect(document.getElementById('app')?.textContent).toContain('No recipients yet.')
  })

  it('shows an error when no active tab is found', async () => {
    messengerMock.tabs.query.mockResolvedValue([])
    await init()
    expect(document.getElementById('app')?.textContent).toContain(
      'Could not identify active tab.',
    )
  })

  it('calls getComposeDetails with the correct tab id', async () => {
    await init()
    expect(messengerMock.compose.getComposeDetails).toHaveBeenCalledWith(MOCK_TAB.id)
  })
})
