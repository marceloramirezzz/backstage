// iCalendar (RFC 5545) text for the calendar feed and the invites in emails.
// Times are the band's local clock times, written as floating times with no
// zone, so every calendar shows the same wall clock.

export interface CalendarItem {
  // Stable for the item's life, so a calendar replaces it rather than adding a copy.
  uid: string;
  summary: string;
  // `2027-05-01`
  date: string;
  // `21:30`; null makes it an all-day item.
  startTime: string | null;
  // Ignored for an all-day item.
  durationMinutes: number;
  location: string | null;
  // Rises with each change, so an invite supersedes the one before it.
  sequence?: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

const escapeText = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Lines longer than 75 octets continue on the next line after a space,
// never splitting a character.
function fold(line: string): string {
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = Buffer.byteLength(char);
    if (size + bytes > (parts.length === 0 ? 75 : 74)) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const local = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}00`;

const day = (d: Date) => local(d).slice(0, 8);

const stampText = (d: Date) => d.toISOString().replace(/[-:]|\.\d{3}/g, "");

function itemLines(item: CalendarItem, stamp: Date): string[] {
  const start = new Date(`${item.date}T${item.startTime ?? "00:00"}:00Z`);
  const lines = ["BEGIN:VEVENT", `UID:${item.uid}`, `DTSTAMP:${stampText(stamp)}`];
  if (item.startTime === null) {
    const next = new Date(start.getTime() + 86_400_000);
    lines.push(`DTSTART;VALUE=DATE:${day(start)}`, `DTEND;VALUE=DATE:${day(next)}`);
  } else {
    const end = new Date(start.getTime() + item.durationMinutes * 60_000);
    lines.push(`DTSTART:${local(start)}`, `DTEND:${local(end)}`);
  }
  lines.push(`SUMMARY:${escapeText(item.summary)}`);
  if (item.location) lines.push(`LOCATION:${escapeText(item.location)}`);
  if (item.sequence !== undefined) lines.push(`SEQUENCE:${item.sequence}`);
  lines.push("END:VEVENT");
  return lines;
}

export function buildCalendar({
  name,
  items,
  stamp,
  method,
}: {
  name: string;
  items: CalendarItem[];
  stamp: Date;
  // Set for an invite sent by email.
  method?: "REQUEST";
}): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Backstage//Calendario//ES",
    "CALSCALE:GREGORIAN",
    ...(method ? [`METHOD:${method}`] : []),
    `X-WR-CALNAME:${escapeText(name)}`,
    ...items.flatMap((item) => itemLines(item, stamp)),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

// The identifiers an Event and a Rehearsal keep for life, in the feed and in
// every invite, so a calendar shows each once.
export const eventUid = (id: string) => `event-${id}@backstage`;
export const rehearsalUid = (id: string) => `rehearsal-${id}@backstage`;

// The `.ics` invite for one item, as an email attachment. Its SEQUENCE is the
// moment it is sent, so it supersedes earlier invites and feed entries.
export function inviteAttachment(filename: string, projectName: string, item: CalendarItem, now: Date) {
  return {
    filename,
    contentType: "text/calendar; charset=utf-8; method=REQUEST",
    content: buildCalendar({
      name: projectName,
      stamp: now,
      method: "REQUEST",
      items: [{ ...item, sequence: Math.floor(now.getTime() / 1000) }],
    }),
  };
}
