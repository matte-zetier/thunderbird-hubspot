import { getStorageItem, setStorageItem } from './storage'

export interface EmailLogEntry {
  engagementId: string
  loggedAt: number
}

const PREFIX = 'hs_log_'

function isEmailLogEntry(v: unknown): v is EmailLogEntry {
  return (
    typeof v === 'object' &&
    v !== null &&
    'engagementId' in v && typeof v.engagementId === 'string' &&
    'loggedAt' in v && typeof v.loggedAt === 'number'
  )
}

export async function getEmailLog(headerMessageId: string): Promise<EmailLogEntry | null> {
  return getStorageItem(`${PREFIX}${headerMessageId}`, isEmailLogEntry)
}

export async function setEmailLog(
  headerMessageId: string,
  engagementId: string,
  loggedAt: number,
): Promise<void> {
  await setStorageItem(`${PREFIX}${headerMessageId}`, { engagementId, loggedAt })
}
