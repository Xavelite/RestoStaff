import type { WeekHistoryItem } from '$lib/calendar/week-history';
import type { PayrollExportRunSummary } from '$lib/api/workspace-snapshot';
import { addDays, mondayFor, weekLabel } from '$lib/calendar/date';
import { normalizePayrollColumns } from './payroll-export-columns';

export type PayrollExportSettings = {
  payroll_export_columns?: unknown;
};

export function payrollColumnsFromSettings(
  settings: PayrollExportSettings | null | undefined
): string[] {
  return normalizePayrollColumns(settings?.payroll_export_columns);
}

export function isCompletePayrollPeriod(periodStart: string, periodEnd: string): boolean {
  return (
    Boolean(periodStart) &&
    Boolean(periodEnd) &&
    mondayFor(periodStart) === periodStart &&
    addDays(mondayFor(periodEnd), 6) === periodEnd &&
    periodEnd >= periodStart
  );
}

export function payrollApprovedMessage(rowCount: number, totalNetMinutes: number): string {
  return `Approved payroll export recorded: ${rowCount} rows · ${(totalNetMinutes / 60).toFixed(2)}h.`;
}

export function payrollDraftMessage(rowCount: number): string {
  return `Draft payroll export downloaded (not approved, no lineage recorded): ${rowCount} rows.`;
}

export function payrollRunHistoryItems(input: {
  runs: PayrollExportRunSummary[] | null | undefined;
  actionDisabled: boolean;
  onDownload: (runId: string) => void;
}): WeekHistoryItem[] {
  return (input.runs ?? []).map((run) => ({
    id: run.id,
    title: 'Payroll export created',
    detail: `${weekLabel(run.period_start)} · ${run.row_count} rows · ${(run.total_net_minutes / 60).toFixed(2)}h · fingerprint ${run.payload_sha256.slice(0, 12)}`,
    when: run.created_at,
    actionLabel: 'Download',
    onaction: () => input.onDownload(run.id),
    actionDisabled: input.actionDisabled
  }));
}
