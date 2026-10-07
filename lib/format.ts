// Display helpers. Times are shown in Eastern, where I work, regardless of server timezone.

const dateTime = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function formatDateTime(iso: string): string {
  return dateTime.format(new Date(iso));
}

export function metersToMiles(meters: number): number {
  return Math.round(meters / 1609.344);
}
