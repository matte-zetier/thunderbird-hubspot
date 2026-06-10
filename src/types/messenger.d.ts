// Thunderbird exposes its WebExtension APIs under `messenger` rather than `browser`.
// Firefox types from @types/firefox-webext-browser serve as the base; Thunderbird-specific
// namespaces below are not present in Firefox and should be expanded as more APIs are used.

type ThunderbirdEvent<T extends (...args: never[]) => void> = {
  addListener(callback: T): void
  removeListener(callback: T): void
  hasListener(callback: T): boolean
}

interface MailFolder {
  accountId: string
  name: string
  path: string
  type?: string
}

interface MessageHeader {
  id: number
  date: Date
  author: string
  recipients: string[]
  ccList: string[]
  bccList: string[]
  subject: string
  read: boolean
  new: boolean
  headerMessageId: string
  folder: MailFolder
}

interface MessageList {
  id: string | null
  messages: MessageHeader[]
}

interface ComposeDetails {
  from?: string
  to?: string[]
  cc?: string[]
  bcc?: string[]
  replyTo?: string[]
  subject?: string
  body?: string
  plainTextBody?: string
  isPlainText?: boolean
  type?: 'new' | 'reply' | 'forward' | 'redirect' | 'draft'
}

interface SendInfo {
  mode: 'sendNow' | 'sendLater'
  messages?: MessageHeader[]
  headerMessageId?: string
  details?: ComposeDetails
  error?: string
}

interface MessagePart {
  contentType: string
  body?: string
  parts?: MessagePart[]
}

declare const messenger: typeof browser & {
  messageDisplay: {
    getDisplayedMessage(tabId: number): Promise<MessageHeader | null>
    onMessageDisplayed: ThunderbirdEvent<
      (tab: browser.tabs.Tab, message: MessageHeader) => void
    >
  }
  messages: {
    get(messageId: number): Promise<MessageHeader>
    getFull(messageId: number): Promise<MessagePart>
    list(folder: MailFolder): Promise<MessageList>
    query(queryInfo: Record<string, unknown>): Promise<MessageList>
    onNewMailReceived: ThunderbirdEvent<
      (folder: MailFolder, messages: MessageList) => void
    >
  }
  compose: {
    getComposeDetails(tabId: number): Promise<ComposeDetails>
    setComposeDetails(tabId: number, details: Partial<ComposeDetails>): Promise<void>
    onAfterSend: ThunderbirdEvent<
      (tab: browser.tabs.Tab, sendInfo: SendInfo) => void
    >
  }
}
