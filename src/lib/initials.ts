// Two letters for an avatar: "Los del Valle" → "LV". Lowercase particles
// (de, del, la) are skipped when the name has capitalised words.
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const capitalised = words.filter((w) => /^\p{Lu}/u.test(w));
  const picked = capitalised.length ? capitalised : words;
  if (!picked.length) return "";
  const letters =
    picked.length === 1 ? picked[0].slice(0, 2) : picked[0][0] + picked[picked.length - 1][0];
  return letters.toLocaleUpperCase("es");
}
