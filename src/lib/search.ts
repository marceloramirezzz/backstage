// Lowercase without accents, so "Bésame" and "besame" compare equal.
const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

// Whether `text` contains `search`, ignoring case and accents, as the
// Repertorio's search does. A blank search matches everything.
export function matchesSearch(text: string, search: string): boolean {
  return fold(text).includes(fold(search.trim()));
}
