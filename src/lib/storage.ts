// The Firefox WebExtension storage API types return `any`.
// This module confines that unsafe boundary so the rest of the codebase works with `unknown`.

export async function getStorageItem<T>(
  key: string,
  guard: (v: unknown) => v is T,
): Promise<T | null> {
  const result = await messenger.storage.local.get(key)
  const value: unknown = result[key]
  return guard(value) ? value : null
}

export async function setStorageItem(key: string, value: unknown): Promise<void> {
  await messenger.storage.local.set({ [key]: value })
}

export async function removeStorageItem(key: string): Promise<void> {
  await messenger.storage.local.remove(key)
}
