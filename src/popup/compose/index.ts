import { escapeHtml } from '../../lib/escape-html'
import { extractEmail } from '../../lib/extract-email'
import { initHubSpotPanel, type RecipientEntry } from '../../lib/hubspot-panel'
import { isConfigured } from '../../api/access-key'

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

  const details = await messenger.compose.getComposeDetails(tab.id)
  const allAddrs = [
    ...(details.to ?? []),
    ...(details.cc ?? []),
    ...(details.bcc ?? []),
  ]

  if (allAddrs.length === 0) {
    appEl.innerHTML = '<p class="muted">No recipients yet.</p>'
    return
  }

  function parseRecipientEntry(addr: string, role: RecipientEntry['role']): RecipientEntry {
    const email = extractEmail(addr)
    const angleIdx = addr.indexOf('<')
    const displayName = angleIdx > 0
      ? addr.slice(0, angleIdx).trim().replace(/^"|"$/g, '').trim()
      : ''
    return displayName ? { email, displayName, role } : { email, role }
  }

  const recipients: RecipientEntry[] = [
    ...(details.to ?? []).map(addr => parseRecipientEntry(addr, 'to')),
    ...(details.cc ?? []).map(addr => parseRecipientEntry(addr, 'cc')),
    ...(details.bcc ?? []).map(addr => parseRecipientEntry(addr, 'bcc')),
  ]

  const sessionKey = `compose_${tab.id}`

  appEl.innerHTML = `
    <section>
      <h2>Subject</h2>
      <p>${escapeHtml(details.subject ?? '(no subject)')}</p>
    </section>
    <div id="hubspot-panel"></div>
  `

  const panelEl = document.getElementById('hubspot-panel')
  if (panelEl) {
    await initHubSpotPanel(panelEl, '', sessionKey, recipients)
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
