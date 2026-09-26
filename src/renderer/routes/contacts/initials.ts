/**
 * displayName → avatar baş harfleri (en fazla 2).
 * "Ali Veli" → "AV", "Ali" → "A", "?" / boş → "?".
 */
export function getInitials(displayName: string): string {
  const parts = displayName
    .trim()
    .split(/\s+/)
    .filter((p) => p && p !== '?');
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.charAt(0).toLocaleUpperCase('tr');
  return (parts[0]!.charAt(0) + parts[parts.length - 1]!.charAt(0)).toLocaleUpperCase('tr');
}

/**
 * Alfabetik section header harfi: displayName'in ilk harfi (büyük).
 * Harf değilse '#'.
 */
export function getSectionLetter(displayName: string): string {
  const ch = displayName.trim().charAt(0).toLocaleUpperCase('tr');
  return /[A-ZÇĞİÖŞÜ]/.test(ch) ? ch : '#';
}
