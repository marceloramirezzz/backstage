// How the UI writes money, times and durations. Amounts are whole Guaraníes.

// Where the bands play; times are shown on this clock.
export const DEFAULT_TIME_ZONE = "America/Asuncion";

// Dot thousands, written out by hand: Spanish locales in Intl skip grouping
// for four-digit numbers ("4500"), and the UI always groups.
const groupThousands = (digits: string) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

const withCurrency = (amount: number, figure: string) =>
  `${amount < 0 ? "-" : ""}Gs. ${figure}`;

// `Gs. 4.500.000`
export function formatGuaranies(amount: number): string {
  return withCurrency(amount, groupThousands(String(Math.abs(Math.round(amount)))));
}

// `Gs. 18,2M`, for stat tiles only. Amounts under a million are shown in full.
export function formatGuaraniesCompact(amount: number): string {
  if (Math.abs(amount) < 1_000_000) return formatGuaranies(amount);
  const tenthsOfMillion = Math.round(Math.abs(amount) / 100_000);
  const whole = groupThousands(String(Math.floor(tenthsOfMillion / 10)));
  const tenth = tenthsOfMillion % 10;
  return withCurrency(amount, `${whole}${tenth ? `,${tenth}` : ""}M`);
}

const clockFormats = new Map<string, Intl.DateTimeFormat>();

function formatTime(date: Date, timeZone: string): string {
  let format = clockFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("es-PY", {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    });
    clockFormats.set(timeZone, format);
  }
  return format.format(date);
}

// `21:30 – 23:30`
export function formatTimeRange(start: Date, end: Date, timeZone = DEFAULT_TIME_ZONE): string {
  return `${formatTime(start, timeZone)} – ${formatTime(end, timeZone)}`;
}

// `2h 10m`, from whole minutes.
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

const pad = (n: number) => String(n).padStart(2, "0");

// `04:12`, from whole seconds; `1:04:12` past an hour.
export function formatClock(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const clock = `${pad(minutes)}:${pad(seconds % 60)}`;
  return hours ? `${hours}:${clock}` : clock;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// `vence en 6 días`: whole days left until `expiresAt`, rounded up.
export function formatExpiresIn(expiresAt: Date, now: Date = new Date()): string {
  const days = Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / DAY_MS));
  return `vence en ${days} ${days === 1 ? "día" : "días"}`;
}
