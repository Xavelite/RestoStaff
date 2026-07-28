type CsvValue = string | number | boolean | null | undefined;

function escapeCsv(value: CsvValue): string {
  const raw = value == null ? '' : String(value);
  // Spreadsheet applications may interpret user-controlled text as a formula.
  // A leading apostrophe preserves the displayed value while forcing text.
  const text =
    typeof value === 'string' && /^[\t\r\n ]*[=+\-@]/.test(raw)
      ? `'${raw}`
      : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function csvText(headers: string[], rows: CsvValue[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
}

export function downloadCsv(filename: string, headers: string[], rows: CsvValue[][]): void {
  const blob = new Blob([`\uFEFF${csvText(headers, rows)}`], {
    type: 'text/csv;charset=utf-8'
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
