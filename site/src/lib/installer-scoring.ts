/**
 * Installer selection optimization.
 *
 * Ranks installer candidates by:
 *  1. Service priority tier (high before medium before low) — soft sort, not a filter:
 *     low-priority installers remain selectable when no higher-priority installer
 *     can serve the requested slot.
 *  2. Within the same priority tier, a weighted score of:
 *     a) Distance — haversine km from installer base to customer postal code
 *     b) Workload — number of bookings this week (fewer = better)
 *     c) Route — avg distance to same-day bookings (closer = better clustering)
 *
 * Weights are configurable via company_settings.
 */

import { postalDistanceKm, averageDistanceKm } from "./postal-distances";

// ─── Types ──────────────────────────────────────────────────────

export type ServicePriority = "high" | "medium" | "low";

export interface InstallerCandidate {
  calendarId: string;
  employeeId: string;
  employeePostalCode: string | null;
  servicePriority: ServicePriority;
}

export interface ScoringWeights {
  distance: number;  // e.g. 40
  workload: number;  // e.g. 30
  route: number;     // e.g. 30
}

export interface ScoringContext {
  customerPostalCode: string;
  /** employeeId → booking count for the target week */
  weekBookingCounts: Record<string, number>;
  /** employeeId → postal codes of same-day bookings */
  sameDayPostalCodes: Record<string, string[]>;
  weights: ScoringWeights;
}

export interface ScoreBreakdown {
  distance: number;   // 0–1
  workload: number;   // 0–1
  route: number;      // 0–1
}

export interface RankedInstaller extends InstallerCandidate {
  score: number;          // 0–1 weighted total
  breakdown: ScoreBreakdown;
}

// ─── Constants ──────────────────────────────────────────────────

const PRIORITY_ORDER: Record<ServicePriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

/** Max reasonable distance in km for normalization (Finland span ~1100km) */
const MAX_DISTANCE_KM = 150;

/** Neutral route score when installer has no same-day bookings */
const NEUTRAL_ROUTE_SCORE = 0.5;

// ─── Main function ──────────────────────────────────────────────

/**
 * Rank installer candidates. Returns sorted list (best first).
 * Higher priority tiers come first; within a tier, ordered by weighted score.
 * The caller (e.g. findAvailableTeam) walks this list in order, so a low-priority
 * installer is still selectable for a slot that no higher-priority installer can serve.
 */
export function rankInstallers(
  candidates: InstallerCandidate[],
  ctx: ScoringContext
): RankedInstaller[] {
  if (candidates.length === 0) return [];

  // ── Compute raw values ──────────────────────────────────────

  const rawDistances: number[] = [];
  const rawWorkloads: number[] = [];
  const rawRoutes: number[] = [];

  for (const c of candidates) {
    // Distance (km)
    const dist =
      c.employeePostalCode
        ? postalDistanceKm(c.employeePostalCode, ctx.customerPostalCode) ?? MAX_DISTANCE_KM
        : MAX_DISTANCE_KM;
    rawDistances.push(Math.min(dist, MAX_DISTANCE_KM));

    // Workload (booking count this week)
    rawWorkloads.push(ctx.weekBookingCounts[c.employeeId] ?? 0);

    // Route clustering (avg km to same-day bookings)
    const sameDayCodes = ctx.sameDayPostalCodes[c.employeeId];
    if (sameDayCodes && sameDayCodes.length > 0) {
      const avgDist = averageDistanceKm(ctx.customerPostalCode, sameDayCodes);
      rawRoutes.push(avgDist !== null ? Math.min(avgDist, MAX_DISTANCE_KM) : MAX_DISTANCE_KM);
    } else {
      rawRoutes.push(-1); // sentinel for "no same-day bookings"
    }
  }

  // ── Normalize to 0–1 (higher = better) ─────────────────────

  const maxDist = Math.max(...rawDistances, 1);
  const maxWork = Math.max(...rawWorkloads, 1);
  const validRoutes = rawRoutes.filter((r) => r >= 0);
  const maxRoute = validRoutes.length > 0 ? Math.max(...validRoutes, 1) : 1;

  const totalWeight =
    (ctx.weights.distance + ctx.weights.workload + ctx.weights.route) || 1;
  const wD = ctx.weights.distance / totalWeight;
  const wW = ctx.weights.workload / totalWeight;
  const wR = ctx.weights.route / totalWeight;

  // ── Score each candidate ────────────────────────────────────

  const ranked: RankedInstaller[] = candidates.map((c, i) => {
    const distScore = 1 - rawDistances[i] / maxDist;
    const workScore = 1 - rawWorkloads[i] / maxWork;
    const routeScore =
      rawRoutes[i] < 0
        ? NEUTRAL_ROUTE_SCORE
        : 1 - rawRoutes[i] / maxRoute;

    const score = wD * distScore + wW * workScore + wR * routeScore;

    return {
      ...c,
      score,
      breakdown: {
        distance: distScore,
        workload: workScore,
        route: routeScore,
      },
    };
  });

  // Priority tier first (high before low), score descending within the same tier
  ranked.sort((a, b) => {
    const pa = PRIORITY_ORDER[a.servicePriority || "medium"];
    const pb = PRIORITY_ORDER[b.servicePriority || "medium"];
    if (pa !== pb) return pa - pb;
    return b.score - a.score;
  });

  return ranked;
}

// ─── Helper: get week bounds ────────────────────────────────────

/**
 * Returns ISO date strings for Monday and Sunday of the week
 * containing the given date.
 */
export function getWeekBounds(dateStr: string): { monday: string; sunday: string } {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay(); // 0=Sun, 1=Mon...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  return {
    monday: fmtDate(monday),
    sunday: fmtDate(sunday),
  };
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
