import { messengerMock } from '../test-utils/messenger-mock'
import { saveAccessKey, getAccessKey, removeAccessKey, isConfigured } from './access-key'

const TEST_KEY = 'pat-na1-abc123def456'

function mockStoredKey(key: string): void {
  messengerMock.storage.local.get.mockResolvedValue({ hubspot_access_key: key })
}

function mockNoKey(): void {
  messengerMock.storage.local.get.mockResolvedValue({})
}

describe('saveAccessKey', () => {
  it('stores the trimmed key in local storage', async () => {
    await saveAccessKey(`  ${TEST_KEY}  `)
    expect(messengerMock.storage.local.set).toHaveBeenCalledWith({
      hubspot_access_key: TEST_KEY,
    })
  })
})

describe('getAccessKey', () => {
  it('returns the stored key', async () => {
    mockStoredKey(TEST_KEY)
    expect(await getAccessKey()).toBe(TEST_KEY)
  })

  it('returns null when no key is stored', async () => {
    mockNoKey()
    expect(await getAccessKey()).toBeNull()
  })

  it('returns null when the stored value is an empty string', async () => {
    messengerMock.storage.local.get.mockResolvedValue({ hubspot_access_key: '' })
    expect(await getAccessKey()).toBeNull()
  })

  it('returns null when the stored value is not a string', async () => {
    messengerMock.storage.local.get.mockResolvedValue({ hubspot_access_key: 42 })
    expect(await getAccessKey()).toBeNull()
  })
})

describe('removeAccessKey', () => {
  it('removes the key from storage', async () => {
    await removeAccessKey()
    expect(messengerMock.storage.local.remove).toHaveBeenCalledWith('hubspot_access_key')
  })
})

describe('isConfigured', () => {
  it('returns true when a key is stored', async () => {
    mockStoredKey(TEST_KEY)
    expect(await isConfigured()).toBe(true)
  })

  it('returns false when no key is stored', async () => {
    mockNoKey()
    expect(await isConfigured()).toBe(false)
  })
})
