import { messengerMock } from '../test-utils/messenger-mock'
import { getEmailLog, setEmailLog } from './email-log'

const HEADER_ID = '<abc123@mail.example.com>'

beforeEach(() => {
  messengerMock.storage.local.get.mockResolvedValue({})
})

describe('getEmailLog', () => {
  it('returns null when nothing is stored', async () => {
    expect(await getEmailLog(HEADER_ID)).toBeNull()
  })

  it('returns the stored entry', async () => {
    messengerMock.storage.local.get.mockResolvedValue({
      [`hs_log_${HEADER_ID}`]: { engagementId: '999', loggedAt: 1234567890 },
    })
    const entry = await getEmailLog(HEADER_ID)
    expect(entry?.engagementId).toBe('999')
    expect(entry?.loggedAt).toBe(1234567890)
  })

  it('returns null when stored value has wrong shape', async () => {
    messengerMock.storage.local.get.mockResolvedValue({
      [`hs_log_${HEADER_ID}`]: { wrong: true },
    })
    expect(await getEmailLog(HEADER_ID)).toBeNull()
  })
})

describe('setEmailLog', () => {
  it('stores the entry under the prefixed key', async () => {
    await setEmailLog(HEADER_ID, '999', 1234567890)
    expect(messengerMock.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        [`hs_log_${HEADER_ID}`]: { engagementId: '999', loggedAt: 1234567890 },
      }),
    )
  })
})
