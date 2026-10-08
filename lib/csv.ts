// CSV writing with spreadsheet-safe cells.

/**
 * One CSV cell. Quotes when needed, and prefixes values that start with
 * = + - @ (or tab/CR) with an apostrophe so a spreadsheet never runs them as
 * a formula. Business names and notes come from outside sources.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
