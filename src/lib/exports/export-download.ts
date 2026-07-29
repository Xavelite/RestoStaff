import type { ExportFile } from './export-recipes';
import { downloadCsv } from './csv.ts';

export type ExportFormat = 'xlsx' | 'pdf' | 'csv';

export type PreparedExport = ExportFile & {
  title: string;
  periodLabel: string;
};

function filenameWithExtension(filename: string, extension: ExportFormat): string {
  return `${filename.replace(/\.[^.]+$/, '')}.${extension}`;
}

export function projectExportColumns(
  file: ExportFile,
  columnIndexes: number[]
): ExportFile {
  const indexes = columnIndexes.filter(
    (index, position) =>
      Number.isInteger(index) &&
      index >= 0 &&
      index < file.headers.length &&
      columnIndexes.indexOf(index) === position
  );

  return {
    filename: file.filename,
    headers: indexes.map((index) => file.headers[index]),
    rows: file.rows.map((row) => indexes.map((index) => row[index] ?? ''))
  };
}

function cellText(value: string | number): string {
  return String(value ?? '');
}

async function downloadXlsx(file: PreparedExport): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const header = file.headers.map((value) => ({
    value,
    type: String,
    fontWeight: 'bold' as const,
    color: '#ffffff',
    backgroundColor: '#172033',
    height: 28,
    align: 'left' as const,
    wrap: true
  }));
  const body = file.rows.map((row, rowIndex) =>
    row.map((value) => ({
      value,
      type: typeof value === 'number' ? Number : String,
      backgroundColor: rowIndex % 2 === 0 ? '#ffffff' : '#f7f8fa',
      color: '#1f2937',
      height: 24,
      align: typeof value === 'number' ? ('right' as const) : ('left' as const),
      wrap: true
    }))
  );
  const columns = file.headers.map((headerValue, index) => {
    const longest = Math.max(
      headerValue.length,
      ...file.rows.slice(0, 100).map((row) => cellText(row[index] ?? '').length)
    );
    return { width: Math.max(10, Math.min(34, longest + 2)) };
  });

  await writeXlsxFile([header, ...body], {
    sheet: 'Export',
    showGridLines: false,
    stickyRowsCount: 1,
    columns,
    orientation: file.headers.length > 6 ? 'landscape' : undefined
  }).toFile(filenameWithExtension(file.filename, 'xlsx'));
}

async function downloadPdf(file: PreparedExport): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ]);
  const landscape = file.headers.length > 5;
  const document = new jsPDF({
    orientation: landscape ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4'
  });
  const pageWidth = document.internal.pageSize.getWidth();

  document.setProperties({
    title: file.title,
    subject: file.periodLabel,
    creator: 'Restogogo'
  });
  document.setFillColor(240, 100, 35);
  document.rect(0, 0, pageWidth, 5, 'F');
  document.setTextColor(23, 32, 51);
  document.setFont('helvetica', 'bold');
  document.setFontSize(16);
  document.text(file.title, 36, 36);
  document.setTextColor(100, 110, 125);
  document.setFont('helvetica', 'normal');
  document.setFontSize(9);
  document.text(file.periodLabel, 36, 52);
  document.text(`${file.rows.length} rows`, pageWidth - 36, 52, { align: 'right' });

  autoTable(document, {
    startY: 68,
    head: [file.headers],
    body: file.rows.map((row) => row.map(cellText)),
    theme: 'grid',
    margin: { top: 30, right: 24, bottom: 28, left: 24 },
    styles: {
      font: 'helvetica',
      fontSize: landscape ? 7 : 7.5,
      cellPadding: 4,
      lineColor: [222, 226, 232],
      lineWidth: 0.45,
      textColor: [39, 48, 62],
      overflow: 'linebreak',
      valign: 'middle'
    },
    headStyles: {
      fillColor: [23, 32, 51],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      minCellHeight: 24
    },
    alternateRowStyles: {
      fillColor: [247, 248, 250]
    },
    didDrawPage: () => {
      const pageNumber = document.getNumberOfPages();
      document.setFontSize(8);
      document.setTextColor(130, 138, 149);
      document.text(
        `Restogogo · ${pageNumber}`,
        document.internal.pageSize.getWidth() - 24,
        document.internal.pageSize.getHeight() - 12,
        { align: 'right' }
      );
    }
  });

  document.save(filenameWithExtension(file.filename, 'pdf'));
}

export async function downloadExport(
  file: PreparedExport,
  format: ExportFormat
): Promise<void> {
  if (format === 'csv') {
    downloadCsv(filenameWithExtension(file.filename, 'csv'), file.headers, file.rows);
    return;
  }
  if (format === 'xlsx') {
    await downloadXlsx(file);
    return;
  }
  await downloadPdf(file);
}
