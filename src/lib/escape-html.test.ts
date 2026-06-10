import { escapeHtml } from './escape-html'

describe('escapeHtml', () => {
  it('leaves safe strings unchanged', () => {
    expect(escapeHtml('hello world')).toStrictEqual('hello world')
  })

  it('escapes ampersands', () => {
    expect(escapeHtml('foo & bar')).toStrictEqual('foo &amp; bar')
  })

  it('escapes angle brackets', () => {
    expect(escapeHtml('<script>')).toStrictEqual('&lt;script&gt;')
  })

  it('escapes double quotes', () => {
    expect(escapeHtml('"quoted"')).toStrictEqual('&quot;quoted&quot;')
  })

  it('escapes all special characters together', () => {
    expect(escapeHtml('<a href="x">foo & bar</a>')).toStrictEqual(
      '&lt;a href=&quot;x&quot;&gt;foo &amp; bar&lt;/a&gt;',
    )
  })

  it('handles an empty string', () => {
    expect(escapeHtml('')).toStrictEqual('')
  })

  it('does not double-escape already-escaped content', () => {
    // escapeHtml is not idempotent — &amp; becomes &amp;amp;
    // This is intentional: it treats input as plain text, not HTML
    expect(escapeHtml('&amp;')).toStrictEqual('&amp;amp;')
  })

  it('neutralises a basic XSS payload by encoding angle brackets', () => {
    // escapeHtml makes payloads safe by encoding < and > so the browser cannot
    // parse the string as a tag — "onerror" as plain text is harmless.
    const payload = '<img src=x onerror="alert(1)">'
    const result = escapeHtml(payload)
    expect(result).not.toContain('<')   // no unescaped opening bracket → no tags parsed
    expect(result).not.toContain('>')   // no unescaped closing bracket
    expect(result).toContain('&lt;img')
  })
})
