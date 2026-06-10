import { vi } from 'vitest'

// Mirrors the shape of the `messenger` global Thunderbird injects at runtime.
// Add properties here as new messenger APIs are used in source code.
export const messengerMock = {
  storage: {
    local: {
      get: vi.fn().mockResolvedValue({}),
      set: vi.fn().mockResolvedValue(undefined),
      remove: vi.fn().mockResolvedValue(undefined),
      clear: vi.fn().mockResolvedValue(undefined),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  runtime: {
    sendMessage: vi.fn().mockResolvedValue(undefined),
    openOptionsPage: vi.fn().mockResolvedValue(undefined),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    getURL: vi.fn((path: string) => `moz-extension://test-id/${path}`),
    lastError: undefined as { message?: string } | undefined,
  },
  tabs: {
    query: vi.fn().mockResolvedValue([]),
  },
  messageDisplay: {
    getDisplayedMessage: vi.fn<(tabId: number) => Promise<MessageHeader | null>>().mockResolvedValue(null),
    onMessageDisplayed: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  messages: {
    get: vi.fn<(messageId: number) => Promise<MessageHeader>>(),
    getFull: vi.fn<(messageId: number) => Promise<MessagePart>>().mockResolvedValue({ contentType: 'text/plain', body: '' }),
    list: vi.fn<(folder: MailFolder) => Promise<MessageList>>(),
    query: vi.fn<(queryInfo: Record<string, unknown>) => Promise<MessageList>>(),
    onNewMailReceived: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  compose: {
    getComposeDetails: vi.fn<(tabId: number) => Promise<ComposeDetails>>().mockResolvedValue({}),
    setComposeDetails: vi.fn<(tabId: number, details: Partial<ComposeDetails>) => Promise<void>>().mockResolvedValue(undefined),
    onAfterSend: {
      addListener: vi.fn<(callback: (tab: browser.tabs.Tab, sendInfo: SendInfo) => void) => void>(),
      removeListener: vi.fn(),
    },
  },
}
