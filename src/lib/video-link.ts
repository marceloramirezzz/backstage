export interface VideoRef {
  provider: "youtube" | "vimeo";
  id: string;
}

const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com"]);
const YOUTUBE_ID = /^[\w-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;

// The video a YouTube or Vimeo address points at, or null for any other
// host or an address that names no video.
export function parseVideoUrl(value: string): VideoRef | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const parts = url.pathname.split("/").filter(Boolean);
  const youtube = (id: string | undefined) => (id && YOUTUBE_ID.test(id) ? ({ provider: "youtube", id } as const) : null);
  const vimeo = (id: string | undefined) => (id && VIMEO_ID.test(id) ? ({ provider: "vimeo", id } as const) : null);

  if (YOUTUBE_HOSTS.has(url.hostname)) {
    if (parts[0] === "watch") return youtube(url.searchParams.get("v") ?? undefined);
    if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live") return youtube(parts[1]);
    return null;
  }
  if (url.hostname === "youtu.be") return youtube(parts[0]);
  if (url.hostname === "vimeo.com" || url.hostname === "www.vimeo.com") return vimeo(parts[0]);
  if (url.hostname === "player.vimeo.com" && parts[0] === "video") return vimeo(parts[1]);
  return null;
}

// The address to put in an iframe.
export function videoEmbedUrl({ provider, id }: VideoRef): string {
  return provider === "youtube"
    ? `https://www.youtube-nocookie.com/embed/${id}`
    : `https://player.vimeo.com/video/${id}`;
}
