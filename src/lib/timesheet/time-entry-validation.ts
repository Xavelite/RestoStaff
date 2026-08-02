type ExactBreakInterval = {
  startedAt: string;
  endedAt: string;
};

type ExactBreakValidationError =
  | 'invalid'
  | 'end_not_after_start'
  | 'outside_work_interval'
  | 'overlap'
  | null;

export function validateExactBreakIntervals(
  clockInAt: string,
  clockOutAt: string,
  intervals: ExactBreakInterval[]
): ExactBreakValidationError {
  const workStart = Date.parse(clockInAt);
  const workEnd = Date.parse(clockOutAt);
  if (!Number.isFinite(workStart) || !Number.isFinite(workEnd)) return 'invalid';

  const parsed = intervals.map((interval) => ({
    start: Date.parse(interval.startedAt),
    end: Date.parse(interval.endedAt)
  }));
  if (parsed.some((interval) => !Number.isFinite(interval.start) || !Number.isFinite(interval.end))) {
    return 'invalid';
  }
  if (parsed.some((interval) => interval.end <= interval.start)) {
    return 'end_not_after_start';
  }
  if (parsed.some((interval) => interval.start < workStart || interval.end > workEnd)) {
    return 'outside_work_interval';
  }

  const ordered = [...parsed].sort((left, right) => left.start - right.start);
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].start < ordered[index - 1].end) return 'overlap';
  }
  return null;
}
