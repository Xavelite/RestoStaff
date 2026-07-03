// Shared metric vocabulary for every module page. One type, one component
// (PageHeaderMetrics → MetricCard). No page-specific metric rows.

export type MetricTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

// A metric is an operational gateway, not just a number: a page can attach a
// `detail` so that clicking the card opens a popup listing the exact rows behind
// the value (and optional navigation/inline actions), instead of only
// redirecting. The shared PageHeaderMetrics renders that popup. A metric with only an
// `href` stays a plain navigation card; one with neither is static.

export type MetricDetailRow = {
  id: string;
  title: string;
  meta?: string;
  value?: string;
  tone?: MetricTone;
  symbol?: string;
};

type MetricDetailActionBase = {
  id: string;
  label: string;
  tone?: 'primary' | 'default';
};

export type MetricDetailAction = MetricDetailActionBase &
  (
    | { href: string; actionId?: never }
    | { actionId: string; href?: never }
  );

export type MetricDetail = {
  title: string;
  subtitle?: string;
  empty?: string;
  rows: MetricDetailRow[];
  actions?: MetricDetailAction[];
};

export type Metric = {
  id: string;
  label: string;
  value: string;
  meta: string;
  tone?: MetricTone;
  symbol: string;
  href?: string;
  detail?: MetricDetail;
};

/**
 * Normal runtime pages always expose exactly four headline metrics.
 * Invalid counts are TypeScript errors instead of renderer-side truncation.
 */
export type FourMetrics = readonly [Metric, Metric, Metric, Metric];
