import type { ExportFile } from './export-recipes';
import type { RowInput } from 'jspdf-autotable';
import { downloadCsv } from './csv.ts';
import type { WeeklyRosterExport } from './weekly-roster.ts';
import { weeklyRosterCellText } from './weekly-roster.ts';
import { formatHours } from '../calendar/date.ts';

export type ExportFormat = 'xlsx' | 'pdf' | 'csv';

export type PreparedExport = ExportFile & {
  title: string;
  periodLabel: string;
  roster?: WeeklyRosterExport;
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
  if (file.roster) {
    await downloadRosterXlsx(file, file.roster);
    return;
  }
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const header = file.headers.map((value) => ({
    value,
    type: String,
    fontWeight: 'bold' as const,
    textColor: '#ffffff',
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
      textColor: '#1f2937',
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

const ROSTER_TONES = [
  { header: '#dbeafe', body: '#f4f8ff', ink: '#1d4ed8' },
  { header: '#e0e7ff', body: '#f6f7ff', ink: '#4338ca' },
  { header: '#ccfbf1', body: '#f0fdfa', ink: '#0f766e' },
  { header: '#fef3c7', body: '#fffbeb', ink: '#a16207' }
] as const;

function rosterTone(index: number): (typeof ROSTER_TONES)[number] {
  return ROSTER_TONES[index % ROSTER_TONES.length];
}

async function downloadRosterXlsx(
  file: PreparedExport,
  roster: WeeklyRosterExport
): Promise<void> {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const serviceCount = roster.services.length;
  const columnCount = 2 + roster.days.length * serviceCount;
  const border = { borderColor: '#d8dee8', borderStyle: 'thin' as const };
  const titleRow = [
    {
      value: roster.restaurantName || file.title,
      type: String,
      columnSpan: columnCount,
      fontSize: 16,
      fontWeight: 'bold' as const,
      textColor: '#ffffff',
      backgroundColor: '#172033',
      height: 34,
      alignVertical: 'center' as const,
      ...border
    },
    ...Array.from({ length: columnCount - 1 }, () => null)
  ];
  const periodRow = [
    {
      value: `${file.title} · ${file.periodLabel}`,
      type: String,
      columnSpan: columnCount - 1,
      fontWeight: 'bold' as const,
      textColor: '#475569',
      backgroundColor: '#f8fafc',
      height: 25,
      ...border
    },
    ...Array.from({ length: columnCount - 2 }, () => null),
    {
      value: formatHours(roster.totalHours),
      type: String,
      fontWeight: 'bold' as const,
      textColor: '#172033',
      backgroundColor: '#e8edf5',
      align: 'center' as const,
      ...border
    }
  ];
  const dayHeader = [
    {
      value: roster.employeeLabel,
      type: String,
      rowSpan: 2,
      fontWeight: 'bold' as const,
      textColor: '#ffffff',
      backgroundColor: '#25324a',
      alignVertical: 'center' as const,
      ...border
    },
    ...roster.days.flatMap((day) => [
      {
        value: `${day.label}\n${day.staffCount} staff · ${formatHours(day.totalHours)}`,
        type: String,
        columnSpan: serviceCount,
        fontWeight: 'bold' as const,
        textColor: '#172033',
        backgroundColor: '#e8edf5',
        height: 34,
        align: 'center' as const,
        alignVertical: 'center' as const,
        wrap: true,
        ...border
      },
      ...Array.from({ length: serviceCount - 1 }, () => null)
    ]),
    {
      value: roster.totalLabel,
      type: String,
      rowSpan: 2,
      fontWeight: 'bold' as const,
      textColor: '#ffffff',
      backgroundColor: '#25324a',
      align: 'center' as const,
      alignVertical: 'center' as const,
      ...border
    }
  ];
  const serviceHeader = [
    null,
    ...roster.days.flatMap(() =>
      roster.services.map((service, serviceIndex) => {
        const tone = rosterTone(serviceIndex);
        return {
          value: service.label,
          type: String,
          fontWeight: 'bold' as const,
          textColor: tone.ink,
          backgroundColor: tone.header,
          height: 24,
          align: 'center' as const,
          ...border
        };
      })
    ),
    null
  ];
  const bodyRows = roster.rows.map((row, rowIndex) => [
    {
      value: row.employeeName,
      type: String,
      fontWeight: 'bold' as const,
      textColor: '#172033',
      backgroundColor: rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc',
      height: 38,
      alignVertical: 'center' as const,
      ...border
    },
    ...row.cells.map((cell, index) => {
      const tone = rosterTone(index % serviceCount);
      const empty = cell.shifts.length === 0;
      return {
        value: weeklyRosterCellText(cell),
        type: String,
        fontSize: 9,
        fontWeight: empty ? undefined : ('bold' as const),
        textColor: empty ? '#94a3b8' : '#172033',
        backgroundColor: empty ? '#f8fafc' : tone.body,
        fillPatternStyle: empty ? ('lightDown' as const) : undefined,
        fillPatternColor: empty ? '#e2e8f0' : undefined,
        height: 38,
        align: 'center' as const,
        alignVertical: 'center' as const,
        wrap: true,
        ...border
      };
    }),
    {
      value: formatHours(row.totalHours),
      type: String,
      fontWeight: 'bold' as const,
      textColor: '#172033',
      backgroundColor: '#eef2f7',
      align: 'center' as const,
      alignVertical: 'center' as const,
      ...border
    }
  ]);
  const summaryRows = [
    [
      {
        value: roster.staffLabel,
        type: String,
        fontWeight: 'bold' as const,
        textColor: '#172033',
        backgroundColor: '#e8edf5',
        ...border
      },
      ...roster.staffCounts.map((value, index) => ({
        value,
        type: Number,
        fontWeight: 'bold' as const,
        textColor: rosterTone(index % serviceCount).ink,
        backgroundColor: rosterTone(index % serviceCount).header,
        align: 'center' as const,
        ...border
      })),
      {
        value: roster.rows.filter((row) => row.totalHours > 0).length,
        type: Number,
        fontWeight: 'bold' as const,
        backgroundColor: '#dbe3ef',
        align: 'center' as const,
        ...border
      }
    ],
    [
      {
        value: roster.hoursLabel,
        type: String,
        fontWeight: 'bold' as const,
        textColor: '#ffffff',
        backgroundColor: '#25324a',
        ...border
      },
      ...roster.serviceHours.map((value) => ({
        value: formatHours(value),
        type: String,
        fontWeight: 'bold' as const,
        textColor: '#ffffff',
        backgroundColor: '#25324a',
        align: 'center' as const,
        ...border
      })),
      {
        value: formatHours(roster.totalHours),
        type: String,
        fontWeight: 'bold' as const,
        textColor: '#ffffff',
        backgroundColor: '#172033',
        align: 'center' as const,
        ...border
      }
    ]
  ];

  const columns = [
    { width: 22 },
    ...Array.from({ length: roster.days.length * serviceCount }, () => ({ width: 13 })),
    { width: 10 }
  ];
  const data = [titleRow, periodRow, dayHeader, serviceHeader, ...bodyRows, ...summaryRows];
  await writeXlsxFile(data, {
    sheet: 'Schedule',
    showGridLines: false,
    stickyRowsCount: 4,
    stickyColumnsCount: 1,
    columns,
    orientation: 'landscape'
  }).toFile(filenameWithExtension(file.filename, 'xlsx'));
}

async function downloadPdf(file: PreparedExport): Promise<void> {
  if (file.roster) {
    await downloadRosterPdf(file, file.roster);
    return;
  }
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

async function downloadRosterPdf(
  file: PreparedExport,
  roster: WeeklyRosterExport
): Promise<void> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable')
  ]);
  const serviceCount = roster.services.length;
  const document = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageWidth = document.internal.pageSize.getWidth();

  document.setProperties({ title: file.title, subject: file.periodLabel, creator: 'Restogogo' });
  document.setFillColor(23, 32, 51);
  document.rect(0, 0, pageWidth, 6, 'F');
  document.setTextColor(23, 32, 51);
  document.setFont('helvetica', 'bold');
  document.setFontSize(15);
  document.text(roster.restaurantName || file.title, 24, 29);
  document.setFontSize(9);
  document.setTextColor(71, 85, 105);
  document.text(`${file.title} · ${file.periodLabel}`, 24, 44);
  document.text(
    `${roster.shiftCount} shifts · ${formatHours(roster.totalHours)}`,
    pageWidth - 24,
    44,
    { align: 'right' }
  );

  const head: RowInput[] = [
    [
      { content: roster.employeeLabel, rowSpan: 2, styles: { fillColor: '#25324a', textColor: '#ffffff' } },
      ...roster.days.map((day) => ({
        content: `${day.label}\n${day.staffCount} staff · ${formatHours(day.totalHours)}`,
        colSpan: serviceCount,
        styles: { fillColor: '#e8edf5', textColor: '#172033', halign: 'center' as const }
      })),
      { content: roster.totalLabel, rowSpan: 2, styles: { fillColor: '#25324a', textColor: '#ffffff', halign: 'center' as const } }
    ],
    roster.days.flatMap(() =>
      roster.services.map((service, index) => {
        const tone = rosterTone(index);
        return {
          content: service.label,
          styles: {
            fillColor: hexToRgb(tone.header),
            textColor: hexToRgb(tone.ink),
            halign: 'center' as const
          }
        };
      })
    )
  ];
  const body: RowInput[] = roster.rows.map((row, rowIndex) => [
    {
      content: row.employeeName,
      styles: {
        fontStyle: 'bold' as const,
        fillColor: rowIndex % 2 === 0 ? '#ffffff' : '#f8fafc'
      }
    },
    ...row.cells.map((cell, index) => {
      const tone = rosterTone(index % serviceCount);
      return {
        content: weeklyRosterCellText(cell),
        styles: {
          fillColor: cell.shifts.length === 0 ? '#fafbfd' : tone.body,
          textColor: '#172033',
          fontStyle: cell.shifts.length === 0 ? ('normal' as const) : ('bold' as const),
          halign: 'center' as const
        }
      };
    }),
    {
      content: formatHours(row.totalHours),
      styles: { fontStyle: 'bold' as const, fillColor: '#eef2f7', halign: 'center' as const }
    }
  ]);
  const foot: RowInput[] = [
    [
      { content: roster.staffLabel, styles: { fillColor: '#e8edf5', textColor: '#172033' } },
      ...roster.staffCounts.map((value, index) => ({
        content: String(value),
        styles: {
          fillColor: hexToRgb(rosterTone(index % serviceCount).header),
          textColor: hexToRgb(rosterTone(index % serviceCount).ink),
          halign: 'center' as const
        }
      })),
      {
        content: String(roster.rows.filter((row) => row.totalHours > 0).length),
        styles: { fillColor: '#dbe3ef', textColor: '#172033', halign: 'center' as const }
      }
    ],
    [
      { content: roster.hoursLabel },
      ...roster.serviceHours.map((value) => ({ content: formatHours(value), styles: { halign: 'center' as const } })),
      { content: formatHours(roster.totalHours), styles: { halign: 'center' as const } }
    ]
  ];

  const available = pageWidth - 48;
  const employeeWidth = 90;
  const totalWidth = 42;
  const serviceWidth = (available - employeeWidth - totalWidth) / (roster.days.length * serviceCount);
  const columnStyles: Record<number, { cellWidth: number }> = {
    0: { cellWidth: employeeWidth },
    [roster.days.length * serviceCount + 1]: { cellWidth: totalWidth }
  };
  for (let index = 1; index <= roster.days.length * serviceCount; index += 1) {
    columnStyles[index] = { cellWidth: serviceWidth };
  }

  autoTable(document, {
    startY: 56,
    head,
    body,
    foot,
    showFoot: 'lastPage',
    theme: 'grid',
    margin: { top: 24, right: 24, bottom: 24, left: 24 },
    tableWidth: available,
    styles: {
      font: 'helvetica',
      fontSize: serviceCount > 2 ? 5.2 : 6.2,
      cellPadding: 3,
      lineColor: [216, 222, 232],
      lineWidth: 0.4,
      textColor: [23, 32, 51],
      overflow: 'linebreak',
      valign: 'middle'
    },
    headStyles: { fontStyle: 'bold', minCellHeight: 22 },
    bodyStyles: { minCellHeight: 27 },
    footStyles: {
      fillColor: [37, 50, 74],
      textColor: [255, 255, 255],
      fontStyle: 'bold'
    },
    columnStyles,
    didDrawCell: (data) => {
      if (data.section !== 'body') return;
      const finalColumn = roster.days.length * serviceCount + 1;
      if (
        data.column.index === 0 ||
        data.column.index === finalColumn ||
        data.cell.text.join('').trim()
      ) return;
      drawCellStripes(document, data.cell.x, data.cell.y, data.cell.width, data.cell.height);
    },
    didDrawPage: () => {
      document.setFontSize(7.5);
      document.setTextColor(130, 138, 149);
      document.text(
        `Restogogo · ${document.getNumberOfPages()}`,
        document.internal.pageSize.getWidth() - 24,
        document.internal.pageSize.getHeight() - 10,
        { align: 'right' }
      );
    }
  });

  document.save(filenameWithExtension(file.filename, 'pdf'));
}

function hexToRgb(value: string): [number, number, number] {
  const normalized = value.replace('#', '');
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
}

function drawCellStripes(
  document: InstanceType<typeof import('jspdf').jsPDF>,
  x: number,
  y: number,
  width: number,
  height: number
): void {
  document.setDrawColor(226, 232, 240);
  document.setLineWidth(0.25);
  for (let offset = -height; offset < width; offset += 7) {
    const startX = Math.max(0, offset);
    const endX = Math.min(width, offset + height);
    if (endX <= startX) continue;
    const startY = height - (startX - offset);
    const endY = height - (endX - offset);
    document.line(x + startX, y + startY, x + endX, y + endY);
  }
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
