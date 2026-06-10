import { escapeHtml } from './escape-html'

export function extractBodyFromPart(part: MessagePart): { html?: string; text?: string } {
  const found = collectParts(part)

  if (found.html) {
    return found.text ? { html: found.html, text: found.text } : { html: found.html }
  }

  if (found.text) {
    // Convert plain text to HTML so HubSpot preserves line breaks
    const html = found.text
      .split('\n')
      .map(line => escapeHtml(line))
      .join('<br>\n')
    return { html, text: found.text }
  }

  return {}
}

function collectParts(part: MessagePart): { html?: string; text?: string } {
  const result: { html?: string; text?: string } = {}

  if (part.contentType === 'text/html' && part.body) {
    result.html = part.body
  } else if (part.contentType === 'text/plain' && part.body) {
    result.text = part.body
  }

  for (const child of part.parts ?? []) {
    const childResult = collectParts(child)
    if (childResult.html && !result.html) result.html = childResult.html
    if (childResult.text && !result.text) result.text = childResult.text
  }

  return result
}
