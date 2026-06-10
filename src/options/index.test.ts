import { http, HttpResponse } from 'msw'
import { messengerMock } from '../test-utils/messenger-mock'
import { server } from '../test-utils/server'
import { HUBSPOT_CRM_BASE } from '../api/constants'
import { init } from './index'

const TEST_KEY = 'pat-na1-abc123'

function setHtml(): void {
  document.body.innerHTML = `
    <form id="settings-form">
      <input id="access-key" type="password" />
      <button type="button" id="toggle-visibility">Show</button>
      <button type="submit" id="save-btn">Save</button>
      <button type="button" id="test-btn">Test Connection</button>
      <button type="button" id="remove-btn">Remove Key</button>
    </form>
    <p id="status"></p>
  `
}

beforeEach(() => {
  setHtml()
  messengerMock.storage.local.get.mockResolvedValue({})
})

describe('init', () => {
  it('populates the input with the stored key on load', async () => {
    messengerMock.storage.local.get.mockResolvedValue({ hubspot_access_key: TEST_KEY })
    await init()
    const input = document.getElementById('access-key') as HTMLInputElement
    expect(input.value).toBe(TEST_KEY)
  })

  it('leaves the input empty when no key is stored', async () => {
    await init()
    const input = document.getElementById('access-key') as HTMLInputElement
    expect(input.value).toBe('')
  })

  it('starts with the key masked (password type)', async () => {
    await init()
    const input = document.getElementById('access-key') as HTMLInputElement
    expect(input.type).toBe('password')
  })
})

describe('save', () => {
  it('saves the entered key on form submit', async () => {
    await init()
    const input = document.getElementById('access-key') as HTMLInputElement
    input.value = TEST_KEY
    document.getElementById('settings-form')?.dispatchEvent(new Event('submit'))
    await new Promise((r) => setTimeout(r, 0))
    expect(messengerMock.storage.local.set).toHaveBeenCalledWith({ hubspot_access_key: TEST_KEY })
  })

  it('shows an error when saving an empty key', async () => {
    await init()
    document.getElementById('settings-form')?.dispatchEvent(new Event('submit'))
    await new Promise((r) => setTimeout(r, 0))
    expect(document.getElementById('status')?.textContent).toContain('Please enter')
    expect(messengerMock.storage.local.set).not.toHaveBeenCalled()
  })
})

describe('remove', () => {
  it('clears storage and empties the input on remove', async () => {
    messengerMock.storage.local.get.mockResolvedValue({ hubspot_access_key: TEST_KEY })
    await init()
    document.getElementById('remove-btn')?.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(messengerMock.storage.local.remove).toHaveBeenCalledWith('hubspot_access_key')
    const input = document.getElementById('access-key') as HTMLInputElement
    expect(input.value).toBe('')
  })
})

describe('toggle visibility', () => {
  it('switches input type between password and text', async () => {
    await init()
    const input = document.getElementById('access-key') as HTMLInputElement
    document.getElementById('toggle-visibility')?.click()
    expect(input.type).toBe('text')
    document.getElementById('toggle-visibility')?.click()
    expect(input.type).toBe('password')
  })
})

describe('test connection', () => {
  beforeEach(() => {
    messengerMock.storage.local.get.mockResolvedValue({ hubspot_access_key: TEST_KEY })
  })

  it('shows success when the API responds 200', async () => {
    await init()
    document.getElementById('test-btn')?.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(document.getElementById('status')?.textContent).toContain('Connected successfully')
  })

  it('shows failure when the API responds with an error', async () => {
    server.use(
      http.get(`${HUBSPOT_CRM_BASE}/contacts`, () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
    )
    await init()
    document.getElementById('test-btn')?.click()
    await new Promise((r) => setTimeout(r, 0))
    expect(document.getElementById('status')?.textContent).toContain('failed')
  })
})
