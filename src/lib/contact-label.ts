import type { ContactPlatform } from "./contact-link.ts";

// The Spanish names of the preset platforms. "Other" shows its own label.
export const CONTACT_LABELS: Record<ContactPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  whatsapp: "WhatsApp",
  email: "Correo",
  phone: "Teléfono",
  tiktok: "TikTok",
  youtube: "YouTube",
  spotify: "Spotify",
  website: "Sitio web",
  other: "Otro",
};

