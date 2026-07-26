import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import {
  MessageSquare,
  ThumbsUp,
  Minus,
  ThumbsDown,
  Smartphone,
  ClipboardCheck,
  Calendar,
  Star,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FeedbackRow {
  id: string;
  rating: "positive" | "neutral" | "negative";
  stars: number | null;
  comment: string | null;
  submitted_at: string;
  created_at: string;
  bookings: {
    booking_number: string;
    booking_date: string;

    customer_id: string | null;
    customers: { first_name: string; last_name: string } | null;
    services: { name: string } | null;
    employees: { id: string; first_name: string; last_name: string } | null;
  } | null;
}

interface InstallerSatisfactionRow {
  id: string;
  booking_number: string;
  booking_date: string;
  customer_satisfaction: "happy" | "neutral" | "unhappy";
  finalized_at: string | null;
  customers: { first_name: string; last_name: string } | null;
  services: { name: string } | null;
  employees: { id: string; first_name: string; last_name: string } | null;
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

function useFeedback() {
  return useQuery({
    queryKey: ["booking-feedback"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_feedback")
        .select(`
          id, rating, stars, comment, submitted_at, created_at,
          bookings(
            booking_number, booking_date, customer_id,
            customers(first_name, last_name),
            services(name),
            employees!bookings_employee_id_fkey(id, first_name, last_name)
          )
        `)
        .not("submitted_at", "is", null)
        .order("submitted_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as FeedbackRow[];
    },
  });
}

function useInstallerSatisfaction() {
  return useQuery({
    queryKey: ["installer-satisfaction"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select(`
          id, booking_number, booking_date, customer_satisfaction, finalized_at,
          customers(first_name, last_name),
          services(name),
          employees!bookings_employee_id_fkey(id, first_name, last_name)
        `)
        .not("customer_satisfaction", "is", null)
        .eq("status", "completed")
        .order("finalized_at", { ascending: false });

      if (error) throw error;
      return (data ?? []) as unknown as InstallerSatisfactionRow[];
    },
  });
}

function useSmsCountsByCustomer() {
  return useQuery({
    queryKey: ["review-sms-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("review_sms_log")
        .select("customer_id");
      if (error) throw error;
      const map = new Map<string, number>();
      for (const row of (data || [])) {
        map.set(row.customer_id, (map.get(row.customer_id) || 0) + 1);
      }
      return map;
    },
  });
}

const SATISFACTION_LABELS: Record<string, { label: string; color: string }> = {
  happy: { label: "Erinomainen", color: "text-green-600" },
  neutral: { label: "Ok", color: "text-yellow-600" },
  unhappy: { label: "Huono", color: "text-red-500" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function ratingEmoji(rating: string) {
  switch (rating) {
    case "positive":
      return <ThumbsUp className="w-4 h-4 text-green-600" />;
    case "neutral":
      return <Minus className="w-4 h-4 text-amber-500" />;
    case "negative":
      return <ThumbsDown className="w-4 h-4 text-red-500" />;
    default:
      return null;
  }
}

function StarsDisplay({ stars }: { stars: number }) {
  return (
    <div className="flex items-center gap-0.5" title={`${stars} / 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`w-3.5 h-3.5 ${n <= stars ? "fill-amber-400 text-amber-400" : "text-gray-300"}`}
        />
      ))}
    </div>
  );
}

function installerName(row: FeedbackRow): string {
  const emp = row.bookings?.employees;
  if (!emp) return "Ei tiedossa";
  return `${emp.first_name} ${emp.last_name}`;
}

function customerName(row: FeedbackRow): string {
  const c = row.bookings?.customers;
  if (!c) return "Ei tiedossa";
  return `${c.first_name} ${c.last_name}`;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fi-FI", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone: "Europe/Helsinki",
  });
}

function pct(count: number, total: number): string {
  if (total === 0) return "0";
  return ((count / total) * 100).toFixed(0);
}

// ---------------------------------------------------------------------------
// Time range
// ---------------------------------------------------------------------------

type TimeRange = "7d" | "30d" | "90d" | "365d" | "ytd" | "all" | "custom";

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: "all", label: "Kaikki" },
  { value: "7d", label: "Viim. 7 pv" },
  { value: "30d", label: "Viim. 30 pv" },
  { value: "90d", label: "Viim. 90 pv" },
  { value: "365d", label: "Viim. 12 kk" },
  { value: "ytd", label: "Tämä vuosi" },
  { value: "custom", label: "Mukautettu" },
];

function rangeBounds(
  range: TimeRange,
  customFrom: string,
  customTo: string,
): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (range === "all") return { from: null, to: null };
  if (range === "ytd") {
    return { from: new Date(now.getFullYear(), 0, 1), to: null };
  }
  if (range === "custom") {
    return {
      from: customFrom ? new Date(customFrom + "T00:00:00") : null,
      to: customTo ? new Date(customTo + "T23:59:59") : null,
    };
  }
  const days = range === "7d" ? 7 : range === "30d" ? 30 : range === "90d" ? 90 : 365;
  const from = new Date(now);
  from.setDate(from.getDate() - days);
  return { from, to: null };
}

function inRange(iso: string | null | undefined, from: Date | null, to: Date | null): boolean {
  if (!iso) return false;
  if (!from && !to) return true;
  const d = new Date(iso);
  if (from && d < from) return false;
  if (to && d > to) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Skeleton() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 bg-border rounded w-48" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-24 bg-surface rounded-2xl" />
        ))}
      </div>
      <div className="h-64 bg-surface rounded-2xl" />
      <div className="h-96 bg-surface rounded-2xl" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function Feedback() {
  const { data: feedback, isLoading } = useFeedback();
  const { data: smsCountMap } = useSmsCountsByCustomer();
  const { data: installerSatisfaction, isLoading: isLoadingSat } = useInstallerSatisfaction();
  const [activeTab, setActiveTab] = useState<"feedback" | "satisfaction">("feedback");
  const [ratingFilter, setRatingFilter] = useState<"all" | "positive" | "neutral" | "negative">("all");
  const [installerFilter, setInstallerFilter] = useState<string>("all");
  const [satInstallerFilter, setSatInstallerFilter] = useState<string>("all");
  const [timeRange, setTimeRange] = useState<TimeRange>("all");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");

  const { from: rangeFrom, to: rangeTo } = useMemo(
    () => rangeBounds(timeRange, customFrom, customTo),
    [timeRange, customFrom, customTo],
  );

  // Time-range-filtered source data — drives every downstream calculation
  const feedbackInRange = useMemo(() => {
    if (!feedback) return [];
    return feedback.filter((f) => inRange(f.submitted_at, rangeFrom, rangeTo));
  }, [feedback, rangeFrom, rangeTo]);

  const satisfactionInRange = useMemo(() => {
    if (!installerSatisfaction) return [];
    return installerSatisfaction.filter((r) =>
      inRange(r.finalized_at ?? r.booking_date, rangeFrom, rangeTo),
    );
  }, [installerSatisfaction, rangeFrom, rangeTo]);

  // Computed stats
  const stats = useMemo(() => {
    if (!feedback) return null;
    const total = feedbackInRange.length;
    const totalSmsSent = smsCountMap ? Array.from(smsCountMap.values()).reduce((s, c) => s + c, 0) : 0;

    const withStars = feedbackInRange.filter((f) => f.stars !== null) as (FeedbackRow & { stars: number })[];
    const starsCount = withStars.length;
    const avgStars = starsCount > 0
      ? withStars.reduce((acc, f) => acc + f.stars, 0) / starsCount
      : null;

    const distribution: Record<1 | 2 | 3 | 4 | 5, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const f of withStars) {
      distribution[f.stars as 1 | 2 | 3 | 4 | 5]++;
    }
    const legacyCount = total - starsCount; // pre-stars rows still in range

    return { total, totalSmsSent, avgStars, starsCount, distribution, legacyCount };
  }, [feedback, feedbackInRange, smsCountMap]);

  // Per-installer stats: count by star, average, total
  const installerStats = useMemo(() => {
    if (!feedback) return [];
    const map = new Map<string, {
      name: string;
      total: number;
      starsCount: number;
      starsSum: number;
      distribution: Record<1 | 2 | 3 | 4 | 5, number>;
    }>();
    for (const f of feedbackInRange) {
      const name = installerName(f);
      const id = f.bookings?.employees?.id ?? "unknown";
      if (!map.has(id)) {
        map.set(id, {
          name,
          total: 0,
          starsCount: 0,
          starsSum: 0,
          distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
        });
      }
      const entry = map.get(id)!;
      entry.total++;
      if (f.stars !== null) {
        entry.starsCount++;
        entry.starsSum += f.stars;
        entry.distribution[f.stars as 1 | 2 | 3 | 4 | 5]++;
      }
    }
    return Array.from(map.values())
      .map((row) => ({
        ...row,
        avgStars: row.starsCount > 0 ? row.starsSum / row.starsCount : null,
      }))
      .sort((a, b) => b.total - a.total);
  }, [feedback, feedbackInRange]);

  // Unique installers for filter dropdown
  const installerOptions = useMemo(() => {
    if (!feedback) return [];
    const names = new Set<string>();
    for (const f of feedbackInRange) {
      names.add(installerName(f));
    }
    return Array.from(names).sort();
  }, [feedback, feedbackInRange]);

  // Filtered feedback list
  const filteredFeedback = useMemo(() => {
    if (!feedback) return [];
    return feedbackInRange.filter((f) => {
      if (ratingFilter !== "all" && f.rating !== ratingFilter) return false;
      if (installerFilter !== "all" && installerName(f) !== installerFilter) return false;
      return true;
    });
  }, [feedback, feedbackInRange, ratingFilter, installerFilter]);

  // Installer satisfaction stats (from bookings directly)
  const satStats = useMemo(() => {
    if (!installerSatisfaction) return null;
    const total = satisfactionInRange.length;
    const happy = satisfactionInRange.filter((r) => r.customer_satisfaction === "happy").length;
    const neutral = satisfactionInRange.filter((r) => r.customer_satisfaction === "neutral").length;
    const unhappy = satisfactionInRange.filter((r) => r.customer_satisfaction === "unhappy").length;
    return { total, happy, neutral, unhappy };
  }, [installerSatisfaction, satisfactionInRange]);

  const satPerInstaller = useMemo(() => {
    if (!installerSatisfaction) return [];
    const map = new Map<string, { name: string; happy: number; neutral: number; unhappy: number; total: number }>();
    for (const r of satisfactionInRange) {
      const emp = r.employees;
      const id = emp?.id ?? "unknown";
      const name = emp ? `${emp.first_name} ${emp.last_name}` : "Ei tiedossa";
      if (!map.has(id)) map.set(id, { name, happy: 0, neutral: 0, unhappy: 0, total: 0 });
      const entry = map.get(id)!;
      entry.total++;
      if (r.customer_satisfaction === "happy") entry.happy++;
      else if (r.customer_satisfaction === "neutral") entry.neutral++;
      else if (r.customer_satisfaction === "unhappy") entry.unhappy++;
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [installerSatisfaction, satisfactionInRange]);

  const satInstallerOptions = useMemo(() => {
    if (!installerSatisfaction) return [];
    const names = new Set<string>();
    for (const r of satisfactionInRange) {
      const emp = r.employees;
      if (emp) names.add(`${emp.first_name} ${emp.last_name}`);
    }
    return Array.from(names).sort();
  }, [installerSatisfaction, satisfactionInRange]);

  const filteredSatisfaction = useMemo(() => {
    if (!installerSatisfaction) return [];
    return satisfactionInRange.filter((r) => {
      if (satInstallerFilter !== "all") {
        const name = r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : "";
        if (name !== satInstallerFilter) return false;
      }
      return true;
    });
  }, [installerSatisfaction, satisfactionInRange, satInstallerFilter]);

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Palautteet</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Calendar className="w-4 h-4 text-text-muted" />
          <select
            value={timeRange}
            onChange={(e) => setTimeRange(e.target.value as TimeRange)}
            className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-white text-text-primary"
          >
            {TIME_RANGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          {timeRange === "custom" && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-white text-text-primary"
              />
              <span className="text-xs text-text-muted">–</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-white text-text-primary"
              />
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-surface rounded-xl border border-border p-1">
        <button
          onClick={() => setActiveTab("feedback")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "feedback" ? "bg-white shadow-sm text-text-primary" : "text-text-muted hover:text-text-primary"}`}
        >
          <MessageSquare className="w-4 h-4" />
          Asiakaspalautteet
        </button>
        <button
          onClick={() => setActiveTab("satisfaction")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === "satisfaction" ? "bg-white shadow-sm text-text-primary" : "text-text-muted hover:text-text-primary"}`}
        >
          <ClipboardCheck className="w-4 h-4" />
          Asentajien arviot
          {satStats && <span className="text-xs bg-accent/10 text-accent px-1.5 py-0.5 rounded-full">{satStats.total}</span>}
        </button>
      </div>

      {(isLoading || isLoadingSat) && <Skeleton />}

      {/* ── Tab: Asiakaspalautteet ── */}
      {!isLoading && stats && activeTab === "feedback" && (
        <div className="space-y-6">
          {/* Section 1: Overview Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="bg-surface rounded-2xl border border-border p-5">
              <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">
                Arvostelukutsut (SMS)
              </p>
              <p className="text-2xl font-bold text-text-primary">{stats.totalSmsSent}</p>
              <p className="text-xs text-text-muted">{stats.total} vastattu ({stats.totalSmsSent > 0 ? Math.round((stats.total / stats.totalSmsSent) * 100) : 0} %)</p>
            </div>
            <div className="bg-surface rounded-2xl border border-amber-200 p-5">
              <div className="flex items-center gap-1.5 mb-1">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                <p className="text-[11px] font-medium text-amber-700 uppercase tracking-wide">
                  Keskiarvo
                </p>
              </div>
              <p className="text-2xl font-bold text-amber-700">
                {stats.avgStars !== null ? stats.avgStars.toFixed(2) : "—"}
              </p>
              <p className="text-xs text-amber-600">
                {stats.avgStars !== null ? `${stats.starsCount} tähtiarviota` : "Ei dataa"}
              </p>
            </div>
            <div className="sm:col-span-2 lg:col-span-3 bg-surface rounded-2xl border border-border p-5">
              <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-3">
                Tähtijakauma
              </p>
              <div className="space-y-1.5">
                {[5, 4, 3, 2, 1].map((level) => {
                  const count = stats.distribution[level as 1 | 2 | 3 | 4 | 5];
                  const percent = stats.starsCount > 0 ? (count / stats.starsCount) * 100 : 0;
                  return (
                    <div key={level} className="flex items-center gap-3 text-xs">
                      <div className="flex items-center gap-1 w-10 shrink-0">
                        <span className="text-text-primary font-semibold">{level}</span>
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      </div>
                      <div className="flex-1 h-2.5 bg-border rounded-full overflow-hidden">
                        <div
                          className="h-full bg-amber-400 transition-all duration-500"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                      <div className="w-24 text-right text-text-muted shrink-0 tabular-nums">
                        <span className="text-text-primary font-medium">{count}</span>
                        <span className="text-text-muted/70 ml-1">({Math.round(percent)} %)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {stats.legacyCount > 0 && (
                <p className="text-[10px] text-text-muted mt-3">
                  {stats.legacyCount} vanhaa palautetta ennen tähtijärjestelmää (ei mukana jakaumassa)
                </p>
              )}
            </div>
          </div>

          {/* Section 2: Per-Installer Table */}
          <div className="bg-surface rounded-2xl border border-border">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-text-primary text-sm">Palautteet asentajittain</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">
                      Asentaja
                    </th>
                    <th className="px-3 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide text-center">5★</th>
                    <th className="px-3 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide text-center">4★</th>
                    <th className="px-3 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide text-center">3★</th>
                    <th className="px-3 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide text-center">2★</th>
                    <th className="px-3 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide text-center">1★</th>
                    <th className="px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide text-center">
                      Yhteensä
                    </th>
                    <th className="px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide text-center">
                      Keskiarvo
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {installerStats.map((row) => {
                    const avg = row.avgStars;
                    const avgColor =
                      avg === null
                        ? "text-text-muted"
                        : avg >= 4.5
                          ? "text-green-600"
                          : avg >= 3.5
                            ? "text-amber-600"
                            : "text-red-500";
                    return (
                      <tr key={row.name} className="hover:bg-surface-hover transition-colors">
                        <td className="px-5 py-3 font-medium text-text-primary">{row.name}</td>
                        {[5, 4, 3, 2, 1].map((level) => {
                          const count = row.distribution[level as 1 | 2 | 3 | 4 | 5];
                          return (
                            <td
                              key={level}
                              className={`px-3 py-3 text-center tabular-nums ${
                                count > 0 ? "text-text-primary font-medium" : "text-text-muted/40"
                              }`}
                            >
                              {count}
                            </td>
                          );
                        })}
                        <td className="px-5 py-3 text-center text-text-primary font-medium tabular-nums">
                          {row.total}
                        </td>
                        <td className={`px-5 py-3 text-center font-bold tabular-nums ${avgColor}`}>
                          {avg !== null ? (
                            <span className="inline-flex items-center gap-1">
                              {avg.toFixed(2)}
                              <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {installerStats.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-text-muted">
                        Ei palautteita.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Section 3: Feedback List */}
          <div className="bg-surface rounded-2xl border border-border">
            <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="font-semibold text-text-primary text-sm">Kaikki palautteet</h3>
              <div className="flex items-center gap-2">
                <select
                  value={ratingFilter}
                  onChange={(e) => setRatingFilter(e.target.value as typeof ratingFilter)}
                  className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-white text-text-primary"
                >
                  <option value="all">Kaikki arviot</option>
                  <option value="positive">Positiivinen</option>
                  <option value="neutral">Neutraali</option>
                  <option value="negative">Negatiivinen</option>
                </select>
                <select
                  value={installerFilter}
                  onChange={(e) => setInstallerFilter(e.target.value)}
                  className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-white text-text-primary"
                >
                  <option value="all">Kaikki asentajat</option>
                  {installerOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="divide-y divide-border">
              {filteredFeedback.map((f) => {
                const custId = f.bookings?.customer_id;
                const smsCount = custId && smsCountMap ? (smsCountMap.get(custId) || 0) : 0;
                return (
                  <div key={f.id} className="px-5 py-4 hover:bg-surface-hover transition-colors">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {f.stars !== null ? <StarsDisplay stars={f.stars} /> : ratingEmoji(f.rating)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-1">
                          <span className="text-sm font-medium text-text-primary">
                            {customerName(f)}
                          </span>
                          <span className="text-xs text-text-muted">
                            {f.bookings?.services?.name ?? ""}
                          </span>
                          <span className="text-xs text-text-muted">
                            {installerName(f)}
                          </span>
                        </div>
                        {f.comment && (
                          <p className="text-sm text-text-primary mb-1">{f.comment}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          {smsCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-text-muted">
                              <Smartphone className="w-3 h-3" />
                              {smsCount} SMS lähetetty
                            </span>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-text-muted shrink-0">
                        {fmtDate(f.submitted_at)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {filteredFeedback.length === 0 && (
                <div className="px-5 py-12 text-center text-text-muted text-sm">
                  Ei palautteita valituilla suodattimilla.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Asentajien arviot ── */}
      {!isLoadingSat && satStats && activeTab === "satisfaction" && (
        <div className="space-y-6">
          {/* Overview stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-surface rounded-2xl border border-border p-5">
              <p className="text-[11px] font-medium text-text-muted uppercase tracking-wide mb-1">Yhteensä</p>
              <p className="text-2xl font-bold text-text-primary">{satStats.total}</p>
              <p className="text-xs text-text-muted">arvioitua käyntiä</p>
            </div>
            <div className="bg-surface rounded-2xl border border-green-200 p-5">
              <div className="flex items-center gap-1.5 mb-1">
                <ThumbsUp className="w-3.5 h-3.5 text-green-600" />
                <p className="text-[11px] font-medium text-green-700 uppercase tracking-wide">Tyytyväinen</p>
              </div>
              <p className="text-2xl font-bold text-green-700">{satStats.happy}</p>
              <p className="text-xs text-green-600">{pct(satStats.happy, satStats.total)} %</p>
            </div>
            <div className="bg-surface rounded-2xl border border-amber-200 p-5">
              <div className="flex items-center gap-1.5 mb-1">
                <Minus className="w-3.5 h-3.5 text-amber-500" />
                <p className="text-[11px] font-medium text-amber-700 uppercase tracking-wide">Neutraali</p>
              </div>
              <p className="text-2xl font-bold text-amber-700">{satStats.neutral}</p>
              <p className="text-xs text-amber-600">{pct(satStats.neutral, satStats.total)} %</p>
            </div>
            <div className="bg-surface rounded-2xl border border-red-200 p-5">
              <div className="flex items-center gap-1.5 mb-1">
                <ThumbsDown className="w-3.5 h-3.5 text-red-500" />
                <p className="text-[11px] font-medium text-red-700 uppercase tracking-wide">Tyytymätön</p>
              </div>
              <p className="text-2xl font-bold text-red-700">{satStats.unhappy}</p>
              <p className="text-xs text-red-500">{pct(satStats.unhappy, satStats.total)} %</p>
            </div>
          </div>

          {/* Per-installer breakdown */}
          <div className="bg-surface rounded-2xl border border-border">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="font-semibold text-text-primary text-sm">Arviot asentajittain</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide">Asentaja</th>
                    <th className="px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide text-center">Tyytyväinen</th>
                    <th className="px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide text-center">Neutraali</th>
                    <th className="px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide text-center">Tyytymätön</th>
                    <th className="px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide text-center">Yhteensä</th>
                    <th className="px-5 py-3 text-xs font-semibold text-text-muted uppercase tracking-wide text-center">Tyytyväisyys</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {satPerInstaller.map((row) => {
                    const satisfaction = row.total > 0 ? Math.round((row.happy / row.total) * 100) : 0;
                    const satColor = satisfaction >= 80 ? "text-green-600" : satisfaction >= 50 ? "text-amber-600" : "text-red-500";
                    return (
                      <tr key={row.name} className="hover:bg-surface-hover transition-colors">
                        <td className="px-5 py-3 font-medium text-text-primary">{row.name}</td>
                        <td className="px-5 py-3 text-center text-green-600 font-medium">{row.happy}</td>
                        <td className="px-5 py-3 text-center text-amber-600 font-medium">{row.neutral}</td>
                        <td className="px-5 py-3 text-center text-red-500 font-medium">{row.unhappy}</td>
                        <td className="px-5 py-3 text-center text-text-primary font-medium">{row.total}</td>
                        <td className={`px-5 py-3 text-center font-bold ${satColor}`}>{satisfaction} %</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Individual ratings list */}
          <div className="bg-surface rounded-2xl border border-border">
            <div className="px-5 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="font-semibold text-text-primary text-sm">Kaikki arviot</h3>
              <select
                value={satInstallerFilter}
                onChange={(e) => setSatInstallerFilter(e.target.value)}
                className="text-xs border border-border rounded-lg px-2.5 py-1.5 bg-white text-text-primary"
              >
                <option value="all">Kaikki asentajat</option>
                {satInstallerOptions.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div className="divide-y divide-border">
              {filteredSatisfaction.map((r) => {
                const sat = SATISFACTION_LABELS[r.customer_satisfaction];
                const empName = r.employees ? `${r.employees.first_name} ${r.employees.last_name}` : "Ei tiedossa";
                const custName = r.customers ? `${r.customers.first_name} ${r.customers.last_name}` : "Ei tiedossa";
                return (
                  <div key={r.id} className="px-5 py-4 hover:bg-surface-hover transition-colors">
                    <div className="flex items-center gap-3">
                      <div>
                        {r.customer_satisfaction === "happy" ? <ThumbsUp className="w-4 h-4 text-green-600" /> :
                         r.customer_satisfaction === "unhappy" ? <ThumbsDown className="w-4 h-4 text-red-500" /> :
                         <Minus className="w-4 h-4 text-amber-500" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <span className="text-sm font-medium text-text-primary">{custName}</span>
                          <span className="text-xs text-text-muted">{r.services?.name ?? ""}</span>
                          <span className="text-xs text-text-muted">{empName}</span>
                          <span className={`text-xs font-medium ${sat?.color ?? ""}`}>{sat?.label ?? ""}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs text-text-muted">{fmtDate(r.booking_date)}</span>
                        <p className="text-[10px] text-text-muted">#{r.booking_number}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredSatisfaction.length === 0 && (
                <div className="px-5 py-12 text-center text-text-muted text-sm">
                  Ei arvioita.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
