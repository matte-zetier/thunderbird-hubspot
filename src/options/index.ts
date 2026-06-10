import { saveAccessKey, getAccessKey, removeAccessKey } from '../api/access-key'
import { HubSpotClient } from '../api/hubspot-client'

export async function init(): Promise<void> {
  const existing = await getAccessKey()
  const keyInput = getKeyInput()
  if (keyInput && existing) keyInput.value = existing

  document.getElementById('settings-form')?.addEventListener('submit', (e) => {
    e.preventDefault()
    void handleSave()
  })
  document.getElementById('remove-btn')?.addEventListener('click', () => {
    void handleRemove()
  })
  document.getElementById('test-btn')?.addEventListener('click', () => {
    void handleTest()
  })
  document.getElementById('toggle-visibility')?.addEventListener('click', toggleVisibility)
}

async function handleSave(): Promise<void> {
  const key = getKeyInput()?.value.trim() ?? ''
  if (!key) {
    showStatus('Please enter an access key.', 'error')
    return
  }
  await saveAccessKey(key)
  showStatus('Access key saved.', 'success')
}

async function handleRemove(): Promise<void> {
  await removeAccessKey()
  const input = getKeyInput()
  if (input) input.value = ''
  showStatus('Access key removed.', 'success')
}

async function handleTest(): Promise<void> {
  const btn = document.getElementById('test-btn')
  if (btn instanceof HTMLButtonElement) {
    btn.disabled = true
    btn.textContent = 'Testing…'
  }
  try {
    await new HubSpotClient().testConnection()
    showStatus('Connected successfully.', 'success')
  } catch {
    showStatus('Connection failed — check your access key.', 'error')
  } finally {
    if (btn instanceof HTMLButtonElement) {
      btn.disabled = false
      btn.textContent = 'Test Connection'
    }
  }
}

function toggleVisibility(): void {
  const input = getKeyInput()
  const btn = document.getElementById('toggle-visibility')
  if (!input) return
  input.type = input.type === 'password' ? 'text' : 'password'
  if (btn) btn.textContent = input.type === 'password' ? 'Show' : 'Hide'
}

export function showStatus(message: string, type: 'success' | 'error'): void {
  const el = document.getElementById('status')
  if (!el) return
  el.textContent = message
  el.className = type
  setTimeout(() => {
    el.textContent = ''
    el.className = ''
  }, 4000)
}

function getKeyInput(): HTMLInputElement | null {
  const el = document.getElementById('access-key')
  return el instanceof HTMLInputElement ? el : null
}

document.addEventListener('DOMContentLoaded', () => {
  void init()
})
