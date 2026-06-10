import { messengerMock } from '../test-utils/messenger-mock'
import { getCheckedItems, setCheckedItems, clearCheckedItems } from './checked-items'
import type { HubSpotContact } from '../api/hubspot-client'

const CONTACT: HubSpotContact = {
  id: '1',
  properties: { firstname: 'Alice', email: 'alice@example.com' },
}

const SESSION = 'message_<test@example.com>'

beforeEach(() => {
  messengerMock.storage.local.get.mockResolvedValue({})
})

describe('getCheckedItems', () => {
  it('returns empty arrays when nothing is stored', async () => {
    const result = await getCheckedItems(SESSION)
    expect(result).toStrictEqual({ contacts: [], companies: [], deals: [] })
  })

  it('returns stored checked items', async () => {
    messengerMock.storage.local.get.mockResolvedValue({
      [`hs_checked_${SESSION}`]: { contacts: [CONTACT], companies: [], deals: [] },
    })
    const result = await getCheckedItems(SESSION)
    expect(result.contacts).toHaveLength(1)
    expect(result.contacts[0]).toStrictEqual(CONTACT)
  })

  it('returns empty arrays when stored value has wrong shape', async () => {
    messengerMock.storage.local.get.mockResolvedValue({
      [`hs_checked_${SESSION}`]: { unexpected: true },
    })
    const result = await getCheckedItems(SESSION)
    expect(result).toStrictEqual({ contacts: [], companies: [], deals: [] })
  })
})

describe('setCheckedItems', () => {
  it('stores items under the prefixed key', async () => {
    await setCheckedItems(SESSION, { contacts: [CONTACT], companies: [], deals: [] })
    expect(messengerMock.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ [`hs_checked_${SESSION}`]: expect.objectContaining({ contacts: [CONTACT] }) }),
    )
  })
})

describe('clearCheckedItems', () => {
  it('removes the prefixed key from storage', async () => {
    await clearCheckedItems(SESSION)
    expect(messengerMock.storage.local.remove).toHaveBeenCalledWith(`hs_checked_${SESSION}`)
  })
})
