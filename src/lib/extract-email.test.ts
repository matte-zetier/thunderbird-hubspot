import { extractEmail } from './extract-email'

describe('extractEmail', () => {
  it('extracts the address from "Name <email>" format', () => {
    expect(extractEmail('Alice Example <alice@example.com>')).toBe('alice@example.com')
  })

  it('returns the trimmed address when there are no angle brackets', () => {
    expect(extractEmail('alice@example.com')).toBe('alice@example.com')
  })

  it('trims surrounding whitespace', () => {
    expect(extractEmail('  alice@example.com  ')).toBe('alice@example.com')
  })

  it('handles a short display name with angle brackets', () => {
    expect(extractEmail('Bob <bob@corp.io>')).toBe('bob@corp.io')
  })

  it('returns an empty string for empty input', () => {
    expect(extractEmail('')).toBe('')
  })

  it('handles an address that is already just an email', () => {
    expect(extractEmail('noreply@example.org')).toBe('noreply@example.org')
  })
})
