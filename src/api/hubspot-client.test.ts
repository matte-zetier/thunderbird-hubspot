import { http, HttpResponse } from 'msw'
import { messengerMock } from '../test-utils/messenger-mock'
import { server } from '../test-utils/server'
import { HUBSPOT_CRM_BASE } from './constants'
import { HubSpotClient } from './hubspot-client'

const TEST_KEY = 'pat-na1-test-key'

const MOCK_CONTACT = {
  id: '42',
  properties: {
    email: 'alice@example.com',
    firstname: 'Alice',
    lastname: 'Example',
    company: 'Acme Corp',
    phone: '+1-555-0100',
  },
}

beforeEach(() => {
  messengerMock.storage.local.get.mockResolvedValue({ hubspot_access_key: TEST_KEY })
})

describe('HubSpotClient.getContactsByEmail', () => {
  let client: HubSpotClient

  beforeEach(() => { client = new HubSpotClient() })

  it('returns an empty array when no contacts match', async () => {
    expect(await client.getContactsByEmail('nobody@example.com')).toStrictEqual([])
  })

  it('returns matching contacts from the search response', async () => {
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ total: 1, results: [MOCK_CONTACT] }),
      ),
    )
    const contacts = await client.getContactsByEmail('alice@example.com')
    expect(contacts).toHaveLength(1)
    expect(contacts[0]).toStrictEqual(MOCK_CONTACT)
  })

  it('sends the correct Authorization header', async () => {
    let authHeader: string | null = null
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, ({ request }) => {
        authHeader = request.headers.get('Authorization')
        return HttpResponse.json({ total: 0, results: [] })
      }),
    )
    await client.getContactsByEmail('test@example.com')
    expect(authHeader).toBe(`Bearer ${TEST_KEY}`)
  })

  it('filters by the provided email address', async () => {
    let requestBody: unknown
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, async ({ request }) => {
        requestBody = await request.json()
        return HttpResponse.json({ total: 0, results: [] })
      }),
    )
    await client.getContactsByEmail('alice@example.com')
    expect(requestBody).toMatchObject({
      filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: 'alice@example.com' }] }],
    })
  })

  it('throws when no access key is configured', async () => {
    messengerMock.storage.local.get.mockResolvedValue({})
    await expect(client.getContactsByEmail('test@example.com')).rejects.toThrow('not configured')
  })

  it('throws on a 401 response', async () => {
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
    )
    await expect(client.getContactsByEmail('test@example.com')).rejects.toThrow('401')
  })
})

describe('HubSpotClient.searchContacts', () => {
  let client: HubSpotClient

  beforeEach(() => { client = new HubSpotClient() })

  it('returns an empty array for a blank query without hitting the API', async () => {
    expect(await client.searchContacts('')).toStrictEqual([])
    expect(await client.searchContacts('   ')).toStrictEqual([])
  })

  it('returns matching contacts from the search response', async () => {
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
        HttpResponse.json({ total: 1, results: [MOCK_CONTACT] }),
      ),
    )
    const contacts = await client.searchContacts('alice')
    expect(contacts).toHaveLength(1)
    expect(contacts[0]).toStrictEqual(MOCK_CONTACT)
  })

  it('sends the query string in the request body', async () => {
    let body: unknown
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ total: 0, results: [] })
      }),
    )
    await client.searchContacts('alice example')
    expect(body).toMatchObject({ query: 'alice example' })
  })

  it('throws when no access key is configured', async () => {
    messengerMock.storage.local.get.mockResolvedValue({})
    await expect(client.searchContacts('alice')).rejects.toThrow('not configured')
  })
})

describe('HubSpotClient.searchCompanies', () => {
  let client: HubSpotClient

  beforeEach(() => { client = new HubSpotClient() })

  it('returns an empty array for a blank query', async () => {
    expect(await client.searchCompanies('')).toStrictEqual([])
  })

  it('returns matching companies', async () => {
    const MOCK_COMPANY = { id: '2', properties: { name: 'Acme Corp', domain: 'acme.com' } }
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/companies/search`, () =>
        HttpResponse.json({ total: 1, results: [MOCK_COMPANY] }),
      ),
    )
    const companies = await client.searchCompanies('acme')
    expect(companies).toHaveLength(1)
    expect(companies[0]).toStrictEqual(MOCK_COMPANY)
  })

  it('sends the query string in the request body', async () => {
    let body: unknown
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/companies/search`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ total: 0, results: [] })
      }),
    )
    await client.searchCompanies('acme corp')
    expect(body).toMatchObject({ query: 'acme corp' })
  })

  it('throws when no access key is configured', async () => {
    messengerMock.storage.local.get.mockResolvedValue({})
    await expect(client.searchCompanies('acme')).rejects.toThrow('not configured')
  })
})

describe('HubSpotClient.searchDeals', () => {
  let client: HubSpotClient

  beforeEach(() => { client = new HubSpotClient() })

  it('returns an empty array for a blank query', async () => {
    expect(await client.searchDeals('')).toStrictEqual([])
  })

  it('returns matching deals', async () => {
    const MOCK_DEAL = { id: '3', properties: { dealname: 'Big Sale', amount: '50000' } }
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/deals/search`, () =>
        HttpResponse.json({ total: 1, results: [MOCK_DEAL] }),
      ),
    )
    const deals = await client.searchDeals('big sale')
    expect(deals).toHaveLength(1)
    expect(deals[0]).toStrictEqual(MOCK_DEAL)
  })

  it('sends the query string in the request body', async () => {
    let body: unknown
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/deals/search`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ total: 0, results: [] })
      }),
    )
    await client.searchDeals('big sale')
    expect(body).toMatchObject({ query: 'big sale' })
  })

  it('throws when no access key is configured', async () => {
    messengerMock.storage.local.get.mockResolvedValue({})
    await expect(client.searchDeals('deal')).rejects.toThrow('not configured')
  })
})

describe('HubSpotClient.getAssociatedCompanies', () => {
  let client: HubSpotClient

  beforeEach(() => { client = new HubSpotClient() })

  it('returns an empty array when the contact has no company associations', async () => {
    expect(await client.getAssociatedCompanies('10')).toStrictEqual([])
  })

  it('fetches associations then batch-reads company details', async () => {
    const MOCK_COMPANY = { id: '20', properties: { name: 'Acme Corp', domain: 'acme.com' } }
    server.use(
      http.get(`${HUBSPOT_CRM_BASE}/contacts/10`, () =>
        HttpResponse.json({ id: '10', properties: {}, associations: { companies: { results: [{ id: '20', type: 'contact_to_company' }] } } }),
      ),
      http.post(`${HUBSPOT_CRM_BASE}/companies/batch/read`, () =>
        HttpResponse.json({ results: [MOCK_COMPANY] }),
      ),
    )
    const companies = await client.getAssociatedCompanies('10')
    expect(companies).toHaveLength(1)
    expect(companies[0]).toStrictEqual(MOCK_COMPANY)
  })

  it('sends the correct IDs in the batch/read request body', async () => {
    let batchBody: unknown
    server.use(
      http.get(`${HUBSPOT_CRM_BASE}/contacts/10`, () =>
        HttpResponse.json({ id: '10', properties: {}, associations: { companies: { results: [{ id: '20', type: 'contact_to_company' }, { id: '21', type: 'contact_to_company' }] } } }),
      ),
      http.post(`${HUBSPOT_CRM_BASE}/companies/batch/read`, async ({ request }) => {
        batchBody = await request.json()
        return HttpResponse.json({ results: [] })
      }),
    )
    await client.getAssociatedCompanies('10')
    expect(batchBody).toMatchObject({ inputs: [{ id: '20' }, { id: '21' }] })
  })

  it('throws when no access key is configured', async () => {
    messengerMock.storage.local.get.mockResolvedValue({})
    await expect(client.getAssociatedCompanies('10')).rejects.toThrow('not configured')
  })
})

describe('HubSpotClient.getAssociatedDeals', () => {
  let client: HubSpotClient

  beforeEach(() => { client = new HubSpotClient() })

  it('returns an empty array when the contact has no deal associations', async () => {
    expect(await client.getAssociatedDeals('10')).toStrictEqual([])
  })

  it('fetches associations then batch-reads deal details', async () => {
    const MOCK_DEAL = { id: '30', properties: { dealname: 'Big Sale', amount: '50000' } }
    server.use(
      http.get(`${HUBSPOT_CRM_BASE}/contacts/10`, () =>
        HttpResponse.json({ id: '10', properties: {}, associations: { deals: { results: [{ id: '30', type: 'contact_to_deal' }] } } }),
      ),
      http.post(`${HUBSPOT_CRM_BASE}/deals/batch/read`, () =>
        HttpResponse.json({ results: [MOCK_DEAL] }),
      ),
    )
    const deals = await client.getAssociatedDeals('10')
    expect(deals).toHaveLength(1)
    expect(deals[0]).toStrictEqual(MOCK_DEAL)
  })

  it('throws when no access key is configured', async () => {
    messengerMock.storage.local.get.mockResolvedValue({})
    await expect(client.getAssociatedDeals('10')).rejects.toThrow('not configured')
  })
})

describe('HubSpotClient.logEmailEngagement', () => {
  let client: HubSpotClient

  beforeEach(() => { client = new HubSpotClient() })

  it('returns the email ID as a string', async () => {
    const id = await client.logEmailEngagement({
      subject: 'Hello', from: 'me@example.com', to: ['you@example.com'],
      timestamp: 0, contactIds: [], companyIds: [], dealIds: [],
    })
    expect(id).toBe('999')
  })

  it('sends associations using HUBSPOT_DEFINED type IDs', async () => {
    let body: unknown
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/emails`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ id: '1', properties: {}, createdAt: '', updatedAt: '', archived: false }, { status: 201 })
      }),
    )
    await client.logEmailEngagement({
      subject: 'Test', from: 'a@b.com', to: [], timestamp: 0,
      contactIds: ['10', '11'], companyIds: ['20'], dealIds: ['30'],
    })
    expect(body).toMatchObject({
      associations: expect.arrayContaining([
        expect.objectContaining({ to: { id: '10' }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 198 }] }),
        expect.objectContaining({ to: { id: '20' }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 186 }] }),
        expect.objectContaining({ to: { id: '30' }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 210 }] }),
      ]),
    })
  })

  it('sends hs_email_subject and hs_email_headers as properties', async () => {
    let body: unknown
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/emails`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ id: '1', properties: {}, createdAt: '', updatedAt: '', archived: false }, { status: 201 })
      }),
    )
    await client.logEmailEngagement({
      subject: 'Test Subject', from: 'a@b.com', to: ['c@d.com'], timestamp: 0,
      contactIds: [], companyIds: [], dealIds: [],
    })
    expect(body).toMatchObject({
      properties: expect.objectContaining({
        hs_email_subject: 'Test Subject',
        hs_email_headers: expect.stringContaining('"a@b.com"'),
      }),
    })
  })

  it('includes firstName and lastName in hs_email_headers when address has a display name', async () => {
    let body: unknown
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/emails`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ id: '1', properties: {}, createdAt: '', updatedAt: '', archived: false }, { status: 201 })
      }),
    )
    await client.logEmailEngagement({
      subject: 'Test', from: 'Alice Example <alice@example.com>',
      to: ['Bob Smith <bob@example.com>'], timestamp: 0,
      contactIds: [], companyIds: [], dealIds: [],
    })
    const parsed = body as { properties: { hs_email_headers: string } }
    const headers = JSON.parse(parsed.properties.hs_email_headers) as unknown
    expect(headers).toMatchObject({
      from: { email: 'alice@example.com', firstName: 'Alice', lastName: 'Example' },
      to: [{ email: 'bob@example.com', firstName: 'Bob', lastName: 'Smith' }],
    })
  })

  it('includes hs_email_html when html is provided', async () => {
    let body: unknown
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/emails`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ id: '1', properties: {}, createdAt: '', updatedAt: '', archived: false }, { status: 201 })
      }),
    )
    await client.logEmailEngagement({
      subject: 'Test', from: 'a@b.com', to: [], timestamp: 0,
      contactIds: [], companyIds: [], dealIds: [],
      html: '<p>Hello World</p>',
    })
    expect(body).toMatchObject({ properties: { hs_email_html: '<p>Hello World</p>' } })
  })

  it('includes hs_email_text when text is provided', async () => {
    let body: unknown
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/emails`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ id: '1', properties: {}, createdAt: '', updatedAt: '', archived: false }, { status: 201 })
      }),
    )
    await client.logEmailEngagement({
      subject: 'Test', from: 'a@b.com', to: [], timestamp: 0,
      contactIds: [], companyIds: [], dealIds: [],
      text: 'Hello World',
    })
    expect(body).toMatchObject({ properties: { hs_email_text: 'Hello World' } })
  })

  it('throws when the API responds with an error', async () => {
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/emails`, () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
    )
    await expect(client.logEmailEngagement({
      subject: '', from: '', to: [], timestamp: 0, contactIds: [], companyIds: [], dealIds: [],
    })).rejects.toThrow('401')
  })
})

describe('HubSpotClient.getEngagementItems', () => {
  let client: HubSpotClient

  beforeEach(() => { client = new HubSpotClient() })

  it('returns empty arrays when the email has no associations', async () => {
    const items = await client.getEngagementItems('999')
    expect(items).toStrictEqual({ contacts: [], companies: [], deals: [] })
  })

  it('batch-reads contacts, companies, and deals from the email associations', async () => {
    const MOCK_CONTACT = { id: '10', properties: { email: 'alice@example.com' } }
    const MOCK_COMPANY = { id: '20', properties: { name: 'Acme Corp' } }
    const MOCK_DEAL = { id: '30', properties: { dealname: 'Big Sale' } }
    server.use(
      http.get(`${HUBSPOT_CRM_BASE}/emails/999`, () =>
        HttpResponse.json({
          id: '999',
          properties: {},
          associations: {
            contacts: { results: [{ id: '10', type: 'email_to_contact' }] },
            companies: { results: [{ id: '20', type: 'email_to_company' }] },
            deals: { results: [{ id: '30', type: 'email_to_deal' }] },
          },
        }),
      ),
      http.post(`${HUBSPOT_CRM_BASE}/contacts/batch/read`, () =>
        HttpResponse.json({ results: [MOCK_CONTACT] }),
      ),
      http.post(`${HUBSPOT_CRM_BASE}/companies/batch/read`, () =>
        HttpResponse.json({ results: [MOCK_COMPANY] }),
      ),
      http.post(`${HUBSPOT_CRM_BASE}/deals/batch/read`, () =>
        HttpResponse.json({ results: [MOCK_DEAL] }),
      ),
    )
    const items = await client.getEngagementItems('999')
    expect(items.contacts[0]).toStrictEqual(MOCK_CONTACT)
    expect(items.companies[0]).toStrictEqual(MOCK_COMPANY)
    expect(items.deals[0]).toStrictEqual(MOCK_DEAL)
  })
})

describe('HubSpotClient.createContact', () => {
  let client: HubSpotClient

  beforeEach(() => { client = new HubSpotClient() })

  it('returns the created contact with the assigned id', async () => {
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts`, () =>
        HttpResponse.json({ id: '42', properties: { email: 'new@example.com', firstname: 'New', lastname: 'Person' } }, { status: 201 }),
      ),
    )
    const contact = await client.createContact({ email: 'new@example.com', firstName: 'New', lastName: 'Person' })
    expect(contact.id).toBe('42')
  })

  it('sends email, firstname, and lastname as properties', async () => {
    let body: unknown
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ id: '1', properties: {} }, { status: 201 })
      }),
    )
    await client.createContact({ email: 'alice@example.com', firstName: 'Alice', lastName: 'Example' })
    expect(body).toMatchObject({ properties: { email: 'alice@example.com', firstname: 'Alice', lastname: 'Example' } })
  })

  it('omits firstname and lastname when not provided', async () => {
    let body: unknown
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts`, async ({ request }) => {
        body = await request.json()
        return HttpResponse.json({ id: '1', properties: {} }, { status: 201 })
      }),
    )
    await client.createContact({ email: 'anon@example.com' })
    expect(body).toMatchObject({ properties: { email: 'anon@example.com' } })
    expect((body as { properties: Record<string, unknown> }).properties).not.toHaveProperty('firstname')
  })

  it('throws when the API responds with an error', async () => {
    server.use(
      http.post(`${HUBSPOT_CRM_BASE}/contacts`, () =>
        HttpResponse.json({ message: 'Conflict' }, { status: 409 }),
      ),
    )
    await expect(client.createContact({ email: 'dupe@example.com' })).rejects.toThrow('409')
  })
})

describe('HubSpotClient.testConnection', () => {
  let client: HubSpotClient

  beforeEach(() => { client = new HubSpotClient() })

  it('resolves without error when the API responds 200', async () => {
    await expect(client.testConnection()).resolves.toBeUndefined()
  })

  it('throws when the API responds with an error', async () => {
    server.use(
      http.get(`${HUBSPOT_CRM_BASE}/contacts`, () =>
        HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
      ),
    )
    await expect(client.testConnection()).rejects.toThrow('401')
  })
})
