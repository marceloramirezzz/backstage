export const CONTACT_PLATFORMS = [
  "instagram",
  "facebook",
  "whatsapp",
  "email",
  "phone",
  "tiktok",
  "youtube",
  "spotify",
  "website",
  "other",
] as const;

export type ContactPlatform = (typeof CONTACT_PLATFORMS)[number];

const isWebAddress = (value: string) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol);
  } catch {
    return false;
  }
};

const digitsOf = (value: string) => value.replace(/\D/g, "");
const HANDLE = /^@?[\w.]{1,30}$/;

// Whether `value` makes sense for the platform. Other takes any text.
export function isValidContactValue(platform: ContactPlatform, value: string): boolean {
  if (platform === "other") return true;
  if (platform === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  if (platform === "phone" || platform === "whatsapp") {
    return /^[\d\s()+.-]+$/.test(value) && digitsOf(value).length >= 6;
  }
  if (platform === "instagram") return HANDLE.test(value) || isWebAddress(value);
  // Facebook, TikTok, YouTube, Spotify and website: the page's web address.
  return isWebAddress(value);
}

// Where the link goes, or null when the value isn't one (plain text on
// the page). Only http(s), tel and mailto are ever produced.
export function contactHref(platform: ContactPlatform, value: string): string | null {
  switch (platform) {
    case "instagram":
      if (isWebAddress(value)) return value;
      return HANDLE.test(value) ? `https://instagram.com/${value.replace(/^@/, "")}` : null;
    case "whatsapp":
      return `https://wa.me/${digitsOf(value)}`;
    case "phone":
      return `tel:${value.trim().startsWith("+") ? "+" : ""}${digitsOf(value)}`;
    case "email":
      return `mailto:${value}`;
    default:
      return isWebAddress(value) ? value : null;
  }
}
