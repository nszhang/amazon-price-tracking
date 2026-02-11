// ISBN-13 to ISBN-10 conversion utility

/**
 * Convert an ISBN-13 (978-prefix) to ISBN-10.
 * Returns null if the ISBN-13 doesn't start with 978 or is invalid.
 */
export function isbn13ToIsbn10(isbn13: string): string | null {
  const cleaned = isbn13.replace(/-/g, '')
  if (cleaned.length !== 13 || !cleaned.startsWith('978')) return null

  // Take digits 4-12 (9 digits after the 978 prefix, excluding ISBN-13 check digit)
  const body = cleaned.substring(3, 12)

  // Calculate ISBN-10 check digit
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += (10 - i) * parseInt(body[i])
  }
  const remainder = (11 - (sum % 11)) % 11
  const checkChar = remainder === 10 ? 'X' : remainder.toString()

  return body + checkChar
}
