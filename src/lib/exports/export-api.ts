import { toApiError } from '$lib/api/error';
import { supabase } from '$lib/supabase/client';
import type { Json } from '$lib/supabase/database.types';
import type { ExportFile } from './export-recipes';

type PayrollPreview = ExportFile & {
  approved: boolean;
  rowCount: number;
  totalNetMinutes: number;
};

function record(value: Json): Record<string, Json | undefined> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, Json>)
    : {};
}

function scalar(value: Json | undefined): string | number {
  return typeof value === 'string' || typeof value === 'number'
    ? value
    : typeof value === 'boolean'
      ? String(value)
      : '';
}

/**
 * Read-only payroll projection for an owner. This intentionally does not create
 * an immutable official export run; that workflow remains parked until Payroll
 * is fully designed.
 */
export async function previewSocialSecretariatCsv(input: {
  restaurantId: string;
  periodStart: string;
  periodEnd: string;
}): Promise<PayrollPreview> {
  const { data, error } = await supabase.rpc('preview_payroll_export', {
    p_restaurant_id: input.restaurantId,
    p_period_start: input.periodStart,
    p_period_end: input.periodEnd
  });
  if (error) throw toApiError(error, 'The social-secretariat export could not be prepared.');

  const value = record(data);
  const headers = Array.isArray(value.headers) ? value.headers.map(scalar).map(String) : [];
  const rows = Array.isArray(value.rows)
    ? value.rows.map((row) => (Array.isArray(row) ? row.map(scalar) : []))
    : [];

  return {
    filename: `social-secretariat-draft-${input.periodStart}-${input.periodEnd}.csv`,
    headers,
    rows,
    approved: value.approved === true,
    rowCount: Number(value.row_count ?? rows.length),
    totalNetMinutes: Number(value.total_net_minutes ?? 0)
  };
}
