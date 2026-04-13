const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

interface Unit {
  unit: Intl.RelativeTimeFormatUnit;
  seconds: number;
}

const units: Unit[] = [
  { unit: "year", seconds: 60 * 60 * 24 * 365 },
  { unit: "month", seconds: 60 * 60 * 24 * 30 },
  { unit: "week", seconds: 60 * 60 * 24 * 7 },
  { unit: "day", seconds: 60 * 60 * 24 },
  { unit: "hour", seconds: 60 * 60 },
  { unit: "minute", seconds: 60 },
  { unit: "second", seconds: 1 },
];

export function formatRelativeTime(input: string | number | Date): string {
  try {
    const date = new Date(input);
    const deltaSeconds = (date.getTime() - Date.now()) / 1000;
    const absDelta = Math.abs(deltaSeconds);
    if (absDelta < 10) return "just now";
    for (const { unit, seconds } of units) {
      if (absDelta >= seconds) {
        return rtf.format(Math.round(deltaSeconds / seconds), unit);
      }
    }
    return rtf.format(Math.round(deltaSeconds), "second");
  } catch {
    return new Date(input).toLocaleString();
  }
}
