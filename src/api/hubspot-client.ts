import { getAccessKey } from './access-key'
import { HUBSPOT_CRM_BASE } from './constants'

export interface HubSpotContact {
  id: string
  properties: {
    email?: string
    firstname?: string
    lastname?: string
    company?: string
    phone?: string
  }
}

export interface HubSpotCompany {
  id: string
  properties: {
    name?: string
    domain?: string
  }
}

export interface HubSpotDeal {
  id: string
  properties: {
    dealname?: string
    amount?: string
    dealstage?: string
    closedate?: string
  }
}

export interface PendingContact {
  email: string
  firstName?: string
  lastName?: string
}

export interface CheckedItems {
  contacts: HubSpotContact[]
  companies: HubSpotCompany[]
  deals: HubSpotDeal[]
  pendingContacts?: PendingContact[]
}

export interface EmailEngagementParams {
  subject: string
  from: string
  to: string[]
  timestamp: number
  contactIds: string[]
  companyIds: string[]
  dealIds: string[]
  html?: string
  text?: string
  direction?: 'EMAIL' | 'INCOMING_EMAIL' | 'FORWARDED_EMAIL'
}

function hasResultsArray(value: unknown): value is { results: unknown[] } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'results' in value &&
    Array.isArray(value.results)
  )
}

interface CrmObjectResponse {
  id: string
}

function isCrmObjectResponse(v: unknown): v is CrmObjectResponse {
  return typeof v === 'object' && v !== null && 'id' in v && typeof v.id === 'string'
}

interface AssociationResult {
  id: string
  type: string
}

interface EmailWithAssociations extends CrmObjectResponse {
  associations?: {
    contacts?: { results: AssociationResult[] }
    companies?: { results: AssociationResult[] }
    deals?: { results: AssociationResult[] }
  }
}

function parseAddress(address: string): { email: string; firstName?: string; lastName?: string } {
  const angleMatch = /<([^>]+)>/.exec(address)
  if (angleMatch) {
    const email = (angleMatch[1] ?? '').trim()
    const displayName = address.slice(0, angleMatch.index).trim().replace(/^"|"$/g, '').trim()
    if (displayName) {
      const spaceIdx = displayName.indexOf(' ')
      if (spaceIdx !== -1) {
        return { email, firstName: displayName.slice(0, spaceIdx), lastName: displayName.slice(spaceIdx + 1) }
      }
      return { email, firstName: displayName }
    }
    return { email }
  }
  return { email: address.trim() }
}

function isAssociationItem(v: unknown): v is { id: string } {
  return (
    typeof v === 'object' &&
    v !== null &&
    'id' in v &&
    typeof v.id === 'string'
  )
}

export class HubSpotClient {
  async getContactsByEmail(email: string): Promise<HubSpotContact[]> {
    const response = await this.fetch(`${HUBSPOT_CRM_BASE}/contacts/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filterGroups: [
          { filters: [{ propertyName: 'email', operator: 'EQ', value: email }] },
        ],
        properties: ['email', 'firstname', 'lastname', 'company', 'phone'],
        limit: 10,
      }),
    })
    const raw: unknown = await response.json()
    if (!hasResultsArray(raw)) {
      throw new Error('Unexpected contacts search response from HubSpot')
    }
    return raw.results as HubSpotContact[]
  }

  async searchContacts(query: string): Promise<HubSpotContact[]> {
    if (!query.trim()) return []
    const response = await this.fetch(`${HUBSPOT_CRM_BASE}/contacts/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        properties: ['email', 'firstname', 'lastname', 'company', 'phone'],
        limit: 10,
      }),
    })
    const raw: unknown = await response.json()
    if (!hasResultsArray(raw)) {
      throw new Error('Unexpected contacts search response from HubSpot')
    }
    return raw.results as HubSpotContact[]
  }

  async searchCompanies(query: string): Promise<HubSpotCompany[]> {
    if (!query.trim()) return []
    const response = await this.fetch(`${HUBSPOT_CRM_BASE}/companies/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        properties: ['name', 'domain'],
        limit: 10,
      }),
    })
    const raw: unknown = await response.json()
    if (!hasResultsArray(raw)) {
      throw new Error('Unexpected companies search response from HubSpot')
    }
    return raw.results as HubSpotCompany[]
  }

  async searchDeals(query: string): Promise<HubSpotDeal[]> {
    if (!query.trim()) return []
    const response = await this.fetch(`${HUBSPOT_CRM_BASE}/deals/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        properties: ['dealname', 'amount', 'dealstage', 'closedate'],
        limit: 10,
      }),
    })
    const raw: unknown = await response.json()
    if (!hasResultsArray(raw)) {
      throw new Error('Unexpected deals search response from HubSpot')
    }
    return raw.results as HubSpotDeal[]
  }

  async getAssociatedCompanies(contactId: string): Promise<HubSpotCompany[]> {
    const response = await this.fetch(
      `${HUBSPOT_CRM_BASE}/contacts/${encodeURIComponent(contactId)}?associations=companies`,
    )
    const raw: unknown = await response.json()
    if (!isCrmObjectResponse(raw)) {
      throw new Error('Unexpected contact response from HubSpot')
    }
    const ids = ((raw as EmailWithAssociations).associations?.companies?.results ?? []).map(r => r.id)
    if (ids.length === 0) return []
    return this.batchReadCompanies(ids)
  }

  async getAssociatedDeals(contactId: string): Promise<HubSpotDeal[]> {
    const response = await this.fetch(
      `${HUBSPOT_CRM_BASE}/contacts/${encodeURIComponent(contactId)}?associations=deals`,
    )
    const raw: unknown = await response.json()
    if (!isCrmObjectResponse(raw)) {
      throw new Error('Unexpected contact response from HubSpot')
    }
    const ids = ((raw as EmailWithAssociations).associations?.deals?.results ?? []).map(r => r.id)
    if (ids.length === 0) return []
    return this.batchReadDeals(ids)
  }

  async logEmailEngagement(params: EmailEngagementParams): Promise<string> {
    // Association type IDs per HUBSPOT_DEFINED category
    const EMAIL_TO_CONTACT = 198
    const EMAIL_TO_COMPANY = 186
    const EMAIL_TO_DEAL = 210

    const associations = [
      ...params.contactIds.map(id => ({
        to: { id },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: EMAIL_TO_CONTACT }],
      })),
      ...params.companyIds.map(id => ({
        to: { id },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: EMAIL_TO_COMPANY }],
      })),
      ...params.dealIds.map(id => ({
        to: { id },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: EMAIL_TO_DEAL }],
      })),
    ]

    const properties: Record<string, string> = {
      hs_timestamp: String(params.timestamp),
      hs_email_direction: params.direction ?? 'EMAIL',
      hs_email_status: 'SENT',
      hs_email_subject: params.subject,
      hs_email_headers: JSON.stringify({
        from: parseAddress(params.from),
        to: params.to.map(addr => parseAddress(addr)),
      }),
    }
    if (params.html !== undefined) properties.hs_email_html = params.html
    if (params.text !== undefined) properties.hs_email_text = params.text

    const response = await this.fetch(`${HUBSPOT_CRM_BASE}/emails`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties, associations }),
    })
    const raw: unknown = await response.json()
    if (!isCrmObjectResponse(raw)) {
      throw new Error('Unexpected email response from HubSpot')
    }
    return raw.id
  }

  async getEngagementItems(emailId: string): Promise<CheckedItems> {
    const response = await this.fetch(
      `${HUBSPOT_CRM_BASE}/emails/${encodeURIComponent(emailId)}?associations=contacts,companies,deals`,
    )
    const raw: unknown = await response.json()
    if (!isCrmObjectResponse(raw)) {
      throw new Error('Unexpected email response from HubSpot')
    }
    const emailObj = raw as EmailWithAssociations
    const contactIds = emailObj.associations?.contacts?.results.map(r => r.id) ?? []
    const companyIds = emailObj.associations?.companies?.results.map(r => r.id) ?? []
    const dealIds = emailObj.associations?.deals?.results.map(r => r.id) ?? []

    const [contacts, companies, deals] = await Promise.all([
      contactIds.length > 0 ? this.batchReadContacts(contactIds) : Promise.resolve([]),
      companyIds.length > 0 ? this.batchReadCompanies(companyIds) : Promise.resolve([]),
      dealIds.length > 0 ? this.batchReadDeals(dealIds) : Promise.resolve([]),
    ])
    return { contacts, companies, deals }
  }

  private async batchReadContacts(ids: string[]): Promise<HubSpotContact[]> {
    const response = await this.fetch(`${HUBSPOT_CRM_BASE}/contacts/batch/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: ids.map(id => ({ id })),
        properties: ['email', 'firstname', 'lastname', 'company', 'phone'],
      }),
    })
    const raw: unknown = await response.json()
    if (!hasResultsArray(raw)) throw new Error('Unexpected batch read response from HubSpot')
    return raw.results as HubSpotContact[]
  }

  private async batchReadCompanies(ids: string[]): Promise<HubSpotCompany[]> {
    const response = await this.fetch(`${HUBSPOT_CRM_BASE}/companies/batch/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inputs: ids.map(id => ({ id })), properties: ['name', 'domain'] }),
    })
    const raw: unknown = await response.json()
    if (!hasResultsArray(raw)) throw new Error('Unexpected batch read response from HubSpot')
    return raw.results as HubSpotCompany[]
  }

  private async batchReadDeals(ids: string[]): Promise<HubSpotDeal[]> {
    const response = await this.fetch(`${HUBSPOT_CRM_BASE}/deals/batch/read`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputs: ids.map(id => ({ id })),
        properties: ['dealname', 'amount', 'dealstage', 'closedate'],
      }),
    })
    const raw: unknown = await response.json()
    if (!hasResultsArray(raw)) throw new Error('Unexpected batch read response from HubSpot')
    return raw.results as HubSpotDeal[]
  }

  async createContact(params: PendingContact): Promise<HubSpotContact> {
    const properties: Record<string, string> = { email: params.email }
    if (params.firstName) properties.firstname = params.firstName
    if (params.lastName) properties.lastname = params.lastName

    const response = await this.fetch(`${HUBSPOT_CRM_BASE}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties }),
    })
    const raw: unknown = await response.json()
    if (!isCrmObjectResponse(raw)) throw new Error('Unexpected contact response from HubSpot')
    return raw as HubSpotContact
  }

  async testConnection(): Promise<void> {
    await this.fetch(`${HUBSPOT_CRM_BASE}/contacts?limit=1`)
  }

  private async fetch(url: string, init?: RequestInit): Promise<Response> {
    const key = await getAccessKey()
    if (!key) throw new Error('HubSpot access key not configured — open Settings to add it')

    const headers = new Headers(init?.headers)
    headers.set('Authorization', `Bearer ${key}`)

    const response = await fetch(url, { ...init, headers })

    if (!response.ok) throw new Error(`HubSpot API error: ${response.status}`)
    return response
  }
}
