import type { WorkspaceRole } from '$lib/api/workspace';
import type { ManagerOperationsReadModel } from '$lib/api/workspace-snapshot';
import { mondayFor, todayInTimezone } from '../calendar/date.ts';
import { buildHomeModel } from '../home/home-model.ts';
import { actualSlotsForDate } from '../timesheet/timesheet-model.ts';

/**
 * One line of the classic Home "Today" table.
 *
 * Home is a portal, not a screen that computes everything: this reshapes what
 * the existing models already work out into a flat list of "here is a thing,
 * here is where you fix it". Every row links somewhere it can be acted on.
 */
export type ClassicTodayRow = {
  key: string;
  /** What it is, e.g. "Leave approvals". */
  label: string;
  /** What the number counts, e.g. "This week". */
  meta: string;
  count: number;
  /** Rows with nothing countable (a week that is simply not published). */
  countable: boolean;
  status: 'Requires review' | 'Action needed' | 'Nothing to do';
  tone: 'ok' | 'attention' | 'problem';
  href: string;
};

const TONE_TO_STATUS = {
  ok: 'Nothing to do',
  attention: 'Requires review',
  problem: 'Action needed'
} as const;

/** Modern hrefs from the shared model point at modern routes. */
const HREF_TO_CLASSIC: Record<string, string> = {
  '/team': '/classic/team',
  '/schedule': '/classic/schedule',
  '/timesheet': '/classic/time'
};

function classicHref(href: string): string {
  return HREF_TO_CLASSIC[href] ?? href;
}

export function buildClassicTodayRows(
  snapshot: ManagerOperationsReadModel,
  role: WorkspaceRole,
  now = new Date()
): ClassicTodayRow[] {
  const timezone = snapshot.restaurant_settings.timezone || 'Europe/Brussels';
  const today = todayInTimezone(timezone, now);
  const weekStart = mondayFor(today);

  const rows: ClassicTodayRow[] = buildHomeModel(snapshot, role, now).actions.rows.map(
    (action) => {
      const tone =
        action.count === 0 ? 'ok' : action.tone === 'danger' ? 'problem' : 'attention';
      return {
        key: action.key,
        label: action.label,
        meta: action.meta,
        count: action.count,
        countable: true,
        status: TONE_TO_STATUS[tone],
        tone,
        href: classicHref(action.href)
      };
    }
  );

  // A shift that was worked but never badged out blocks week approval, so it
  // belongs on the same list as the approvals themselves.
  const missingBadges = actualSlotsForDate(snapshot, today, today, now).filter(
    (slot) => slot.status === 'missing'
  ).length;
  rows.push({
    key: 'badges',
    label: 'Missing badge-outs',
    meta: 'Today',
    count: missingBadges,
    countable: true,
    status: missingBadges ? 'Requires review' : 'Nothing to do',
    tone: missingBadges ? 'attention' : 'ok',
    href: '/classic/time'
  });

  const published =
    snapshot.work_weeks.find((week) => week.week_start === weekStart)?.planning_status ===
    'published';
  rows.push({
    key: 'publish',
    label: published ? 'Schedule published' : 'Schedule not published',
    meta: 'This week',
    count: 0,
    countable: false,
    status: published ? 'Nothing to do' : 'Action needed',
    tone: published ? 'ok' : 'problem',
    href: '/classic/schedule/publish'
  });

  // Anything needing a decision floats up; settled rows stay visible below, so
  // the table reads as a checklist rather than hiding what is already fine.
  const order = { problem: 0, attention: 1, ok: 2 } as const;
  return rows.sort((left, right) => order[left.tone] - order[right.tone]);
}
