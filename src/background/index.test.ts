import { http, HttpResponse } from 'msw'
import { messengerMock } from '../test-utils/messenger-mock'
import { server } from '../test-utils/server'
import { HUBSPOT_CRM_BASE } from '../api/constants'

const STORED_KEY = 'pat-na1-test-key'
const MOCK_TAB = { id: 7 } as browser.tabs.Tab

const MOCK_SEND_INFO: SendInfo = {
  mode: 'sendNow',
  messages: [{
    id: 100, author: 'me@example.com', subject: 'Test Email',
    recipients: ['you@example.com'], ccList: [], bccList: [],
    date: new Date('2024-01-01'), read: false, new: true,
    headerMessageId: '<sent-msg@example.com>',
    folder: { accountId: 'acct1', name: 'Sent', path: '/Sent' },
  }],
  details: { from: 'me@example.com', to: ['you@example.com'], subject: 'Test Email' },
}

let sendCallback: (tab: browser.tabs.Tab, sendInfo: SendInfo) => void

beforeEach(async () => {
  vi.resetModules()
  messengerMock.storage.local.get.mockResolvedValue({ hubspot_access_key: STORED_KEY })
  await import('./index')
  const registered = messengerMock.compose.onAfterSend.addListener.mock.calls[0]?.[0]
  if (registered === undefined) throw new Error('onAfterSend listener was not registered')
  sendCallback = registered
})

function withCheckedItems(mockFn: ReturnType<typeof vi.fn>): void {
  mockFn.mockImplementation((key: string) =>
    Promise.resolve(
      key === 'hs_checked_compose_7'
        ? { 'hs_checked_compose_7': { contacts: [{ id: '1', properties: {} }], companies: [], deals: [] } }
        : { hubspot_access_key: STORED_KEY },
    ),
  )
}

function logCalls(): unknown[][] {
  return (messengerMock.storage.local.set.mock.calls as unknown[][]).filter(([arg]) =>
    typeof arg === 'object' && arg !== null && 'hs_log_<sent-msg@example.com>' in arg,
  )
}

describe('background onAfterSend handler', () => {
  it('does nothing when mode is sendLater', async () => {
    sendCallback(MOCK_TAB, { ...MOCK_SEND_INFO, mode: 'sendLater' })
    await new Promise((r) => setTimeout(r, 10))
    expect(logCalls()).toHaveLength(0)
  })

  it('logs an engagement when checked items exist and stores the log entry', async () => {
    withCheckedItems(messengerMock.storage.local.get)
    sendCallback(MOCK_TAB, MOCK_SEND_INFO)
    await new Promise((r) => setTimeout(r, 30))
    expect(messengerMock.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ 'hs_log_<sent-msg@example.com>': expect.objectContaining({ engagementId: '999' }) }),
    )
  })

  it('clears checked items after sending', async () => {
    withCheckedItems(messengerMock.storage.local.get)
    sendCallback(MOCK_TAB, MOCK_SEND_INFO)
    await new Promise((r) => setTimeout(r, 30))
    expect(messengerMock.storage.local.remove).toHaveBeenCalledWith('hs_checked_compose_7')
  })

  it('skips logging when no items are checked', async () => {
    sendCallback(MOCK_TAB, MOCK_SEND_INFO)
    await new Promise((r) => setTimeout(r, 30))
    expect(logCalls()).toHaveLength(0)
  })

  it('skips logging when the access key is not configured', async () => {
    messengerMock.storage.local.get.mockResolvedValue({})
    sendCallback(MOCK_TAB, MOCK_SEND_INFO)
    await new Promise((r) => setTimeout(r, 30))
    expect(logCalls()).toHaveLength(0)
  })

  it('uses details.from as the sender, not a recipient address', async () => {
    withCheckedItems(messengerMock.storage.local.get)
    let requestBody: unknown
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/emails`, async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json({ id: '999', properties: {}, createdAt: '', updatedAt: '', archived: false }, { status: 201 })
      }),
    )
    sendCallback(MOCK_TAB, MOCK_SEND_INFO)
    await new Promise((r) => setTimeout(r, 30))
    const headers = JSON.parse(
      (requestBody as { properties: { hs_email_headers: string } }).properties.hs_email_headers,
    ) as { from: { email: string } }
    expect(headers.from.email).toBe('me@example.com')
  })

  it('includes cc and bcc addresses in the to header', async () => {
    withCheckedItems(messengerMock.storage.local.get)
    let requestBody: unknown
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/emails`, async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json({ id: '999', properties: {}, createdAt: '', updatedAt: '', archived: false }, { status: 201 })
      }),
    )
    const withCcBcc = { ...MOCK_SEND_INFO, details: { ...MOCK_SEND_INFO.details, cc: ['cc@example.com'], bcc: ['bcc@example.com'] } }
    sendCallback(MOCK_TAB, withCcBcc)
    await new Promise((r) => setTimeout(r, 30))
    const headers = JSON.parse(
      (requestBody as { properties: { hs_email_headers: string } }).properties.hs_email_headers,
    ) as { to: { email: string }[] }
    const emails = headers.to.map(t => t.email)
    expect(emails).toContain('you@example.com')
    expect(emails).toContain('cc@example.com')
    expect(emails).toContain('bcc@example.com')
  })

  it('still clears checked items even when the engagement API fails', async () => {
    withCheckedItems(messengerMock.storage.local.get)
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/emails`, () =>
        HttpResponse.json({ message: 'Server error' }, { status: 500 }),
      ),
    )
    sendCallback(MOCK_TAB, MOCK_SEND_INFO)
    await new Promise((r) => setTimeout(r, 30))
    expect(messengerMock.storage.local.remove).toHaveBeenCalledWith('hs_checked_compose_7')
  })
})
