// Calendar days as `YYYY-MM-DD` and months as `YYYY-MM` strings, with no time
// zone to shift them. Weeks start on Sunday.

export interface CalendarDay {
  date: string;
  day: number;
  // Belongs to the month before or after the one shown.
  outside: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

const toDate = (year: number, month: number, day: number) =>
  `${year}-${pad(month)}-${pad(day)}`;

// The month's days, padded to whole Sunday–Saturday weeks.
export function monthGrid(month: string): CalendarDay[] {
  const [year, m] = month.split("-").map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, m, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const weeks = Math.ceil((lead + daysInMonth) / 7);
  return Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(Date.UTC(year, m - 1, 1 - lead + i));
    return {
      date: toDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
      day: d.getUTCDate(),
      outside: d.getUTCMonth() !== m - 1,
    };
  });
}

// `requested` when it's a real `YYYY-MM`, else `fallback`.
export function parseMonth(requested: string | undefined, fallback: string): string {
  const match = requested?.match(/^(\d{4})-(\d{2})$/);
  return match && Number(match[2]) >= 1 && Number(match[2]) <= 12 ? requested! : fallback;
}

export function addMonths(month: string, delta: number): string {
  const [year, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

// `22:00 – 02:00`: from the start time for the duration, wrapping past midnight.
export function eventTimeRange(startTime: string, durationMinutes: number): string {
  const [h, m] = startTime.split(":").map(Number);
  const end = (h * 60 + m + durationMinutes) % 1440;
  return `${startTime} – ${pad(Math.floor(end / 60))}:${pad(end % 60)}`;
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const utcDay = (date: string) => new Date(`${date}T00:00:00Z`);

// `Septiembre 2026`
export function formatMonthTitle(month: string): string {
  const text = new Intl.DateTimeFormat("es-PY", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcDay(`${month}-01`));
  return capitalize(text.replace(" de ", " "));
}

// `Sábado 26 de septiembre`
export function formatLongDate(date: string): string {
  return capitalize(
    new Intl.DateTimeFormat("es-PY", {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    })
      .format(utcDay(date))
      .replace(",", ""),
  );
}

// The inclusive `YYYY-MM-DD` bounds of the month, or of its whole year.
export function periodRange(month: string, byYear: boolean): { from: string; to: string } {
  const year = month.slice(0, 4);
  if (byYear) return { from: `${year}-01-01`, to: `${year}-12-31` };
  const last = new Date(Date.UTC(+year, +month.slice(5), 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${pad(last)}` };
}
