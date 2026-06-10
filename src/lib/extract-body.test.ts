import { extractBodyFromPart } from './extract-body'

describe('extractBodyFromPart', () => {
  it('returns html from a text/html part', () => {
    const part: MessagePart = { contentType: 'text/html', body: '<p>Hello</p>' }
    expect(extractBodyFromPart(part)).toStrictEqual({ html: '<p>Hello</p>' })
  })

  it('returns text from a text/plain part and converts it to html', () => {
    const part: MessagePart = { contentType: 'text/plain', body: 'Hello World' }
    const result = extractBodyFromPart(part)
    expect(result.text).toBe('Hello World')
    expect(result.html).toBe('Hello World')
  })

  it('converts newlines to <br> when plain text only', () => {
    const part: MessagePart = { contentType: 'text/plain', body: 'Line one\nLine two\nLine three' }
    const result = extractBodyFromPart(part)
    expect(result.html).toBe('Line one<br>\nLine two<br>\nLine three')
    expect(result.text).toBe('Line one\nLine two\nLine three')
  })

  it('escapes HTML entities in plain text bodies', () => {
    const part: MessagePart = { contentType: 'text/plain', body: '<script>alert(1)</script>' }
    const result = extractBodyFromPart(part)
    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('&lt;script&gt;')
  })

  it('returns empty object when body is empty string', () => {
    const part: MessagePart = { contentType: 'text/plain', body: '' }
    expect(extractBodyFromPart(part)).toStrictEqual({})
  })

  it('returns empty object when no body and no parts', () => {
    const part: MessagePart = { contentType: 'multipart/mixed' }
    expect(extractBodyFromPart(part)).toStrictEqual({})
  })

  it('prefers html over plain text in a multipart/alternative message', () => {
    const part: MessagePart = {
      contentType: 'multipart/alternative',
      parts: [
        { contentType: 'text/plain', body: 'Plain version' },
        { contentType: 'text/html', body: '<p>HTML version</p>' },
      ],
    }
    const result = extractBodyFromPart(part)
    expect(result.html).toBe('<p>HTML version</p>')
    expect(result.text).toBe('Plain version')
  })

  it('returns html when the top-level part has nested html', () => {
    const part: MessagePart = {
      contentType: 'multipart/mixed',
      parts: [
        {
          contentType: 'multipart/alternative',
          parts: [{ contentType: 'text/html', body: '<p>Nested HTML</p>' }],
        },
      ],
    }
    expect(extractBodyFromPart(part)).toStrictEqual({ html: '<p>Nested HTML</p>' })
  })

  it('falls back to plain text when no html part exists', () => {
    const part: MessagePart = {
      contentType: 'multipart/mixed',
      parts: [{ contentType: 'text/plain', body: 'Only plain' }],
    }
    const result = extractBodyFromPart(part)
    expect(result.text).toBe('Only plain')
    expect(result.html).toBeDefined()
  })
})
