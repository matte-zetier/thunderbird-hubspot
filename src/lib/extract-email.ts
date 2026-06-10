export function extractEmail(address: string): string {
  const match = /<([^>]+)>/.exec(address)
  return (match?.[1] ?? address).trim()
}
