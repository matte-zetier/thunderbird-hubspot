import { http, HttpResponse } from 'msw'

export const HUBSPOT_API_BASE = 'https://api.hubapi.com'
export const HUBSPOT_CRM_BASE = `${HUBSPOT_API_BASE}/crm/objects/2026-03`

// Default happy-path handlers. Override in individual tests with server.use(...)
// when you need error states or specific response shapes.
export const handlers = [
  http.get(`${HUBSPOT_CRM_BASE}/contacts`, () =>
    HttpResponse.json({ results: [], paging: null }),
  ),

  http.post(`${HUBSPOT_CRM_BASE}/contacts`, () =>
    HttpResponse.json({ id: '1', properties: {} }, { status: 201 }),
  ),

  http.post(`${HUBSPOT_CRM_BASE}/contacts/search`, () =>
    HttpResponse.json({ total: 0, results: [] }),
  ),

  http.post(`${HUBSPOT_CRM_BASE}/companies/search`, () =>
    HttpResponse.json({ total: 0, results: [] }),
  ),

  http.post(`${HUBSPOT_CRM_BASE}/deals/search`, () =>
    HttpResponse.json({ total: 0, results: [] }),
  ),

  http.get(`${HUBSPOT_CRM_BASE}/contacts/:contactId`, () =>
    HttpResponse.json({ id: '1', properties: {}, associations: { companies: { results: [] }, deals: { results: [] } } }),
  ),

  http.post(`${HUBSPOT_CRM_BASE}/contacts/batch/read`, () =>
    HttpResponse.json({ results: [] }),
  ),

  http.post(`${HUBSPOT_CRM_BASE}/companies/batch/read`, () =>
    HttpResponse.json({ results: [] }),
  ),

  http.post(`${HUBSPOT_CRM_BASE}/deals/batch/read`, () =>
    HttpResponse.json({ results: [] }),
  ),

  http.post(`${HUBSPOT_CRM_BASE}/emails`, () =>
    HttpResponse.json({ id: '999', properties: {}, createdAt: '', updatedAt: '', archived: false }, { status: 201 }),
  ),

  http.get(`${HUBSPOT_CRM_BASE}/emails/:emailId`, () =>
    HttpResponse.json({ id: '999', properties: {}, associations: {} }),
  ),

  http.post(`${HUBSPOT_API_BASE}/oauth/v1/token`, () =>
    HttpResponse.json({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      expires_in: 1800,
    }),
  ),
]
