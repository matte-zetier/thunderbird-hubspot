import { HubSpotClient } from '../api/hubspot-client'
import { isConfigured } from '../api/access-key'
import { getCheckedItems, clearCheckedItems } from '../lib/checked-items'
import { setEmailLog } from '../lib/email-log'
import { extractBodyFromPart } from '../lib/extract-body'

messenger.messages.onNewMailReceived.addListener((folder, messages) => {
  console.log(
    `[HubSpot] ${messages.messages.length} new message(s) in ${folder.name}`,
  )
})

messenger.compose.onAfterSend.addListener((tab, sendInfo) => {
  if (sendInfo.mode !== 'sendNow') return
  void handleAfterSend(tab.id, sendInfo)
})

async function handleAfterSend(tabId: number | undefined, sendInfo: SendInfo): Promise<void> {
  if (!await isConfigured()) return

  const sessionKey = `compose_${tabId ?? 0}`
  const checked = await getCheckedItems(sessionKey)

  if (
    checked.contacts.length === 0 &&
    checked.companies.length === 0 &&
    checked.deals.length === 0
  ) {
    await clearCheckedItems(sessionKey)
    return
  }

  let body: { html?: string; text?: string } = {}
  const firstMessage = sendInfo.messages?.[0]
  if (firstMessage) {
    try {
      const part = await messenger.messages.getFull(firstMessage.id)
      body = extractBodyFromPart(part)
    } catch {
      // Proceed without body content
    }
  }

  try {
    const client = new HubSpotClient()
    const details = sendInfo.details
    const engagementId = await client.logEmailEngagement({
      subject: details?.subject ?? '(no subject)',
      from: details?.from ?? '',
      to: [...(details?.to ?? []), ...(details?.cc ?? []), ...(details?.bcc ?? [])],
      timestamp: Date.now(),
      contactIds: checked.contacts.map(c => c.id),
      companyIds: checked.companies.map(c => c.id),
      dealIds: checked.deals.map(d => d.id),
      ...body,
    })

    // Store the log flag against all saved copies of the sent message
    for (const message of sendInfo.messages ?? []) {
      await setEmailLog(message.headerMessageId, engagementId, Date.now())
    }
  } catch (err) {
    console.error('[HubSpot] Failed to log email engagement:', err)
  } finally {
    await clearCheckedItems(sessionKey)
  }
}
