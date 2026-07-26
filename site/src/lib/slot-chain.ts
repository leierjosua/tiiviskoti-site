/**
 * Single source of truth for installer slot chains.
 *
 * Both /api/availability (slot list shown to the customer) and findAvailableTeam
 * (installer assignment at booking time) call buildChainedSlotTimes so they agree
 * on which start times are valid for a given calendar. If they ever disagreed,
 * the customer could pick a slot that gets assigned to an installer for whom
 * the time isn't on their natural grid, leaving subsequent slots misaligned.
 */

export type Range = { start: number; end: number };
export type Occupied = { start: number; end: number };

export function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function subtractRange(
  r: Range,
  blockStart: number,
  blockEnd: number
): Range[] {
  if (blockStart >= r.end || blockEnd <= r.start) return [r];
  if (blockStart <= r.start && blockEnd >= r.end) return [];
  const result: Range[] = [];
  if (blockStart > r.start) result.push({ start: r.start, end: blockStart });
  if (blockEnd < r.end) result.push({ start: blockEnd, end: r.end });
  return result;
}

/**
 * Walk each range forward in steps of `step`, jumping past any occupied period
 * via cursor = blocker.end. Returns the set of valid slot start times (in
 * minutes from midnight) for one calendar on one day.
 *
 * `step` is decoupled from `duration` so a multi-unit booking (e.g. 2× wash)
 * can be offered on the single-unit grid (baseDuration + transition) while each
 * candidate still reserves the full multi-unit footprint for the fit/collision
 * check. This keeps the calendar on a clean single-wash grid (08:00, 10:00,
 * 12:00) instead of a coarse double grid (08:00, 11:30) that fragments the day.
 * Defaults to (duration + transition) for the single-unit case.
 *
 * NOTE: blocker.end must already include the blocking booking's own transition,
 * i.e. occupied entries are [bookingStart, bookingStart + bookingDuration + bookingTransition).
 */
export function buildChainedSlotTimes(
  ranges: Range[],
  occupied: Occupied[],
  duration: number,
  transition: number,
  earliestMinute = 0,
  step = duration + transition
): Set<number> {
  const result = new Set<number>();
  const fullStep = step;
  const sortedOccupied = [...occupied].sort((a, b) => a.start - b.start);

  for (const range of ranges) {
    let cursor = range.start;
    while (cursor + duration + transition <= range.end) {
      if (cursor < earliestMinute) {
        cursor += fullStep;
        continue;
      }
      const slotEnd = cursor + duration + transition;
      const blocker = sortedOccupied.find(
        (occ) => cursor < occ.end && occ.start < slotEnd
      );
      if (!blocker) {
        result.add(cursor);
        cursor += fullStep;
      } else {
        cursor = blocker.end;
      }
    }
  }

  return result;
}
