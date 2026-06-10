import { escapeHtml } from '../../lib/escape-html'
import { extractEmail } from '../../lib/extract-email'
import { extractBodyFromPart } from '../../lib/extract-body'
import { initHubSpotPanel, type RecipientEntry } from '../../lib/hubspot-panel'
import { getCheckedItems, setCheckedItems } from '../../lib/checked-items'
import { getEmailLog, setEmailLog } from '../../lib/email-log'
import { isConfigured } from '../../api/access-key'
import { HubSpotClient } from '../../api/hubspot-client'

export async function init(): Promise<void> {
  const [tab] = await messenger.tabs.query({ active: true, currentWindow: true })
  const appEl = document.getElementById('app')
  if (!appEl) return

  if (!await isConfigured()) {
    renderSettingsPrompt(appEl)
    return
  }

  if (!tab?.id) {
    appEl.innerHTML = '<p class="error">Could not identify active tab.</p>'
    return
  }

  const message = await messenger.messageDisplay.getDisplayedMessage(tab.id)
  if (!message) {
    appEl.innerHTML = '<p class="muted">No message selected.</p>'
    return
  }

  const sessionKey = `message_${message.headerMessageId}`
  const client = new HubSpotClient()

  // If this email was previously logged, refresh checked items from HubSpot
  const log = await getEmailLog(message.headerMessageId)
  if (log) {
    try {
      const items = await client.getEngagementItems(log.engagementId)
      await setCheckedItems(sessionKey, items)
    } catch {
      // Fall back to whatever is already in storage
    }
  }

  appEl.innerHTML = `
    <section>
      <h2>Subject</h2>
      <p>${escapeHtml(message.subject)}</p>
    </section>
    <div id="hubspot-panel"></div>
    <div id="crm-action">
      <button id="update-crm-btn">Update CRM</button>
      <p id="crm-status" class="muted"></p>
    </div>
  `

  // Parse recipients from the message
  function parseRecipientEntry(addr: string, role: RecipientEntry['role']): RecipientEntry {
    const email = extractEmail(addr)
    const angleIdx = addr.indexOf('<')
    const displayName = angleIdx > 0
      ? addr.slice(0, angleIdx).trim().replace(/^"|"$/g, '').trim()
      : ''
    return displayName
      ? { email, displayName, role }
      : { email, role }
  }

  const recipients: RecipientEntry[] = [
    parseRecipientEntry(message.author, 'from'),
    ...message.recipients.map(addr => parseRecipientEntry(addr, 'to')),
    ...message.ccList.map(addr => parseRecipientEntry(addr, 'cc')),
    ...message.bccList.map(addr => parseRecipientEntry(addr, 'bcc')),
  ]

  const panelEl = document.getElementById('hubspot-panel')
  if (panelEl) {
    await initHubSpotPanel(panelEl, '', sessionKey, recipients.length > 0 ? recipients : undefined)
  }

  document.getElementById('update-crm-btn')?.addEventListener('click', () => {
    void handleUpdateCrm(message, sessionKey)
  })
}

async function handleUpdateCrm(message: MessageHeader, sessionKey: string): Promise<void> {
  const statusEl = document.getElementById('crm-status')
  const btn = document.getElementById('update-crm-btn') as HTMLButtonElement | null
  if (btn) btn.disabled = true
  if (statusEl) statusEl.textContent = 'Updating…'

  try {
    const checked = await getCheckedItems(sessionKey)
    const pendingContacts = checked.pendingContacts ?? []
    if (
      checked.contacts.length === 0 &&
      checked.companies.length === 0 &&
      checked.deals.length === 0 &&
      pendingContacts.length === 0
    ) {
      if (statusEl) statusEl.textContent = 'Select at least one contact, company, or deal first.'
      return
    }

    let body: { html?: string; text?: string } = {}
    try {
      const part = await messenger.messages.getFull(message.id)
      body = extractBodyFromPart(part)
    } catch {
      // Log without body content
    }

    const client = new HubSpotClient()

    // Create any recipients that weren't yet in HubSpot
    const createdIds: string[] = []
    for (const pending of pendingContacts) {
      try {
        const contact = await client.createContact(pending)
        createdIds.push(contact.id)
      } catch {
        // Skip contacts that fail to create
      }
    }

    const engagementId = await client.logEmailEngagement({
      subject: message.subject,
      from: message.author,
      to: [...message.recipients, ...message.ccList, ...message.bccList],
      timestamp: message.date.getTime(),
      contactIds: [...checked.contacts.map(c => c.id), ...createdIds],
      companyIds: checked.companies.map(c => c.id),
      dealIds: checked.deals.map(d => d.id),
      ...body,
    })

    await setEmailLog(message.headerMessageId, engagementId, Date.now())

    if (statusEl) statusEl.textContent = 'CRM updated.'
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    if (statusEl) statusEl.textContent = `Failed: ${msg}`
  } finally {
    if (btn) btn.disabled = false
  }
}

function renderSettingsPrompt(container: HTMLElement): void {
  container.innerHTML = `
    <p class="muted">Add your HubSpot Personal Access Key to get started.</p>
    <button id="settings-btn">Open Settings</button>
  `
  document.getElementById('settings-btn')?.addEventListener('click', () => {
    void messenger.runtime.openOptionsPage()
  })
}

document.addEventListener('DOMContentLoaded', () => {
  void init()
})
