import { getStorageItem, setStorageItem, removeStorageItem } from '../lib/storage'

const STORAGE_KEY = 'hubspot_access_key'

export async function saveAccessKey(key: string): Promise<void> {
  await setStorageItem(STORAGE_KEY, key.trim())
}

export async function getAccessKey(): Promise<string | null> {
  return getStorageItem(STORAGE_KEY, isNonEmptyString)
}

export async function removeAccessKey(): Promise<void> {
  await removeStorageItem(STORAGE_KEY)
}

export async function isConfigured(): Promise<boolean> {
  return (await getAccessKey()) !== null
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
