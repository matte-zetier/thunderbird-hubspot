import type { CheckedItems } from '../api/hubspot-client'
import { getStorageItem, setStorageItem, removeStorageItem } from './storage'

const PREFIX = 'hs_checked_'

function isCheckedItems(v: unknown): v is CheckedItems {
  return (
    typeof v === 'object' &&
    v !== null &&
    'contacts' in v && Array.isArray(v.contacts) &&
    'companies' in v && Array.isArray(v.companies) &&
    'deals' in v && Array.isArray(v.deals)
  )
}

export async function getCheckedItems(sessionKey: string): Promise<CheckedItems> {
  const stored = await getStorageItem(`${PREFIX}${sessionKey}`, isCheckedItems)
  return stored ?? { contacts: [], companies: [], deals: [] }
}

export async function setCheckedItems(sessionKey: string, items: CheckedItems): Promise<void> {
  await setStorageItem(`${PREFIX}${sessionKey}`, items)
}

export async function clearCheckedItems(sessionKey: string): Promise<void> {
  await removeStorageItem(`${PREFIX}${sessionKey}`)
}
