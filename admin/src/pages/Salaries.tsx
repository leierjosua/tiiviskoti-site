import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { useEmployees } from "@/hooks/useEmployees";
import { useServices } from "@/hooks/useServices";
import { supabase } from "@/lib/supabase";
import { queryKeys } from "@/lib/queryKeys";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatCents, formatDate, MONTH_NAMES_FI, downloadCsv } from "@/lib/utils";
import { ChevronDown, ChevronRight, ExternalLink, Download, Wallet, Plus, Trash2, RotateCcw } from "lucide-react";
import { DatePicker } from "@/components/ui/DatePicker";
import { TIER_LABELS } from "@/lib/constants";
import type { Booking, Employee, BookingLineItem } from "@/lib/types";
import type { TimeEntry } from "@/hooks/useTimeTracking";

// Get first and last day of a month
function monthRange(year: number, month: number) {
  const from = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const to = `${year}-${String(month + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from, to };
}


function useMonthTimeEntries(from: string, to: string) {
  return useQuery({
    queryKey: ["salary-time-entries", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("time_entries")
        .select("*")
        .gte("clock_in", `${from}T00:00:00`)
        .lte("clock_in", `${to}T23:59:59`)
        .not("clock_out", "is", null)
        .order("clock_in", { ascending: true });
      if (error) throw error;
      return data as TimeEntry[];
    },
  });
}

/** Get worked hours per day from time entries. Key = "YYYY-MM-DD" */
function hoursPerDay(entries: TimeEntry[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const e of entries) {
    if (!e.clock_out) continue;
    const day = e.clock_in.slice(0, 10);
    const start = new Date(e.clock_in).getTime();
    const end = new Date(e.clock_out).getTime();
    const h = Math.max(0, (end - start) / 60_000 - (e.break_minutes || 0)) / 60;
    map.set(day, (map.get(day) || 0) + h);
  }
  return map;
}

/** Get ISO 8601 week number from a date string "YYYY-MM-DD" */
function isoWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  // Set to nearest Thursday: current date + 4 - current day number (Mon=1..Sun=7)
  const dayNum = d.getDay() || 7; // convert Sun=0 to 7
  const thursday = new Date(d);
  thursday.setDate(d.getDate() + 4 - dayNum);
  // ISO year is the year of the Thursday
  const year = thursday.getFullYear();
  // Week 1 is the week containing Jan 4
  const jan1 = new Date(year, 0, 1);
  const weekNum = Math.ceil(((thursday.getTime() - jan1.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(weekNum).padStart(2, "0")}`;
}

/**
 * LVI TES overtime calculation (ilmanvaihtoala)
 *
 * Daily:
 *   0–8 h    = normal
 *   8–10 h   = 1.5× (first 2h overtime)
 *   10+ h    = 2×
 *
 * Weekly (on top of daily overtime):
 *   contractHours + 4 h buffer = normal weekly threshold
 *   next 8 h   = 1.5×
 *   beyond that = 2×
 *
 * Weekly overtime is calculated from hours that were "normal" at daily level
 * but exceed the weekly threshold.
 */
interface OvertimeBreakdown {
  workedHours: number;
  normalHours: number;
  daily150Hours: number;   // päivittäinen ylityö 50%
  daily200Hours: number;   // päivittäinen ylityö 100%
  weekly150Hours: number;  // viikottainen ylityö 50%
  weekly200Hours: number;  // viikottainen ylityö 100%
  normalPay: number;
  daily150Pay: number;
  daily200Pay: number;
  weekly150Pay: number;
  weekly200Pay: number;
  totalPay: number;
}

function calcLviOvertime(entries: TimeEntry[], contractWeeklyHours: number, hourlyRateCents: number): OvertimeBreakdown {
  const daily = hoursPerDay(entries);
  const rate = hourlyRateCents;

  // Step 1: Daily overtime — classify each day's hours
  let totalDaily150 = 0;
  let totalDaily200 = 0;
  // dailyNormal: hours per day that are "normal" at daily level
  const dailyNormalByDay = new Map<string, number>();

  for (const [day, h] of daily) {
    const normal = Math.min(h, 8);
    const ot150 = Math.min(Math.max(h - 8, 0), 2);
    const ot200 = Math.max(h - 10, 0);
    totalDaily150 += ot150;
    totalDaily200 += ot200;
    dailyNormalByDay.set(day, normal);
  }

  // Step 2: Weekly overtime — from daily-normal hours that exceed weekly threshold
  // Group daily-normal hours by ISO week
  const weeklyNormal = new Map<string, number>();
  for (const [day, h] of dailyNormalByDay) {
    const week = isoWeek(day);
    weeklyNormal.set(week, (weeklyNormal.get(week) || 0) + h);
  }

  const weeklyThreshold = contractWeeklyHours + 2.5; // e.g. 37.5 + 2.5 = 40
  let totalWeekly150 = 0;
  let totalWeekly200 = 0;

  for (const [, weekHours] of weeklyNormal) {
    const excess = Math.max(0, weekHours - weeklyThreshold);
    const w150 = Math.min(excess, 8);
    const w200 = Math.max(excess - 8, 0);
    totalWeekly150 += w150;
    totalWeekly200 += w200;
  }

  const workedHours = Array.from(daily.values()).reduce((s, h) => s + h, 0);
  const normalHours = Math.max(0, workedHours - totalDaily150 - totalDaily200 - totalWeekly150 - totalWeekly200);

  // Ensure minimum pay = contractWeeklyHours * 4.2 * rate (monthly contract hours)
  const contractMonthlyHours = Math.round(contractWeeklyHours * 4.2 * 10) / 10;
  const minNormalHours = Math.max(normalHours, contractMonthlyHours);

  const normalPay = Math.round(minNormalHours * rate);
  const daily150Pay = Math.round(totalDaily150 * rate * 1.5);
  const daily200Pay = Math.round(totalDaily200 * rate * 2);
  const weekly150Pay = Math.round(totalWeekly150 * rate * 1.5);
  const weekly200Pay = Math.round(totalWeekly200 * rate * 2);

  return {
    workedHours,
    normalHours: minNormalHours,
    daily150Hours: totalDaily150,
    daily200Hours: totalDaily200,
    weekly150Hours: totalWeekly150,
    weekly200Hours: totalWeekly200,
    normalPay,
    daily150Pay,
    daily200Pay,
    weekly150Pay,
    weekly200Pay,
    totalPay: normalPay + daily150Pay + daily200Pay + weekly150Pay + weekly200Pay,
  };
}

function useSalaryBookings(from: string, to: string) {
  return useQuery({
    queryKey: ["salary-bookings", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("*, services(*), employees!bookings_employee_id_fkey(*), customers(*), booking_employees(*, employees(*)), booking_line_items(*, addon_services(*))")
        .is("deleted_at", null)
        .in("status", ["completed", "confirmed"])
        .gt("price_cents", 0)
        .gte("booking_date", from)
        .lte("booking_date", to)
        .order("booking_date", { ascending: true });
      if (error) throw error;
      return data as Booking[];
    },
  });
}

// Fetch completed contract visits for a given month, with their booking's employee info
function useContractVisitsForMonth(year: number, month: number) {
  return useQuery({
    queryKey: ["salary-contract-visits", year, month],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_visits")
        .select("*, contracts(id, contract_price_cents), bookings(id, booking_date, booking_employees(employee_id))")
        .eq("scheduled_year", year)
        .eq("scheduled_month", month + 1) // DB uses 1-indexed months
        .eq("visit_status", "completed");
      if (error) throw error;
      return (data || []) as Array<{
        id: string;
        contract_id: string;
        contracts: { id: string; contract_price_cents: number } | null;
        bookings: { id: string; booking_date: string; booking_employees: { employee_id: string }[] } | null;
      }>;
    },
  });
}

interface SellerCommissionLine {
  salesperson_id: string;
  source: "opportunity" | "booking";
  opportunity_id: string | null;
  booking_id: string | null;
  booking_number: number | null;
  customer_name: string | null;
  commission_date: string;
  computed_cents: number;
  total_cents: number;
  override_cents: number | null;
}

function useSellerCommissionLines(from: string, to: string) {
  return useQuery({
    queryKey: ["seller-commission-lines", from, to],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_seller_commission_lines_for_period", {
        p_date_from: `${from}T00:00:00Z`,
        p_date_to: `${to}T23:59:59Z`,
      });
      if (error) throw error;
      return (data ?? []) as SellerCommissionLine[];
    },
  });
}

function useSetSellerCommissionOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { line: SellerCommissionLine; cents: number }) => {
      const { line, cents } = input;
      const row: { opportunity_id: string | null; booking_id: string | null; override_cents: number } =
        line.source === "opportunity"
          ? { opportunity_id: line.opportunity_id, booking_id: null, override_cents: cents }
          : { opportunity_id: null, booking_id: line.booking_id, override_cents: cents };
      const onConflict = line.source === "opportunity" ? "opportunity_id" : "booking_id";
      const { error } = await supabase
        .from("seller_commission_overrides")
        .upsert(row, { onConflict });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seller-commission-lines"] });
    },
  });
}

function useResetSellerCommissionOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (line: SellerCommissionLine) => {
      const q = supabase.from("seller_commission_overrides").delete();
      const { error } = line.source === "opportunity"
        ? await q.eq("opportunity_id", line.opportunity_id!)
        : await q.eq("booking_id", line.booking_id!);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["seller-commission-lines"] });
    },
  });
}

interface ManualCommission {
  id: string;
  employee_id: string;
  booking_id: string | null;
  amount_cents: number;
  description: string;
  commission_date: string;
  created_at: string;
  bookings?: { booking_number: number } | null;
}

function useManualCommissions(from: string, to: string) {
  return useQuery({
    queryKey: ["manual-commissions", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("manual_commissions")
        .select("*, bookings(booking_number)")
        .gte("commission_date", from)
        .lte("commission_date", to)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ManualCommission[];
    },
  });
}

function useAddManualCommission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employee_id: string; amount_cents: number; description: string; commission_date: string; booking_id?: string | null }) => {
      const { error } = await supabase.from("manual_commissions").insert(input);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["manual-commissions"] }); },
  });
}

function useDeleteManualCommission() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("manual_commissions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["manual-commissions"] }); },
  });
}

function SalaryBookingRow({ booking: b, comm, bookingEmployeeId, overrideCents, isConfirmed, isPaid, customItems, showCommission }: {
  booking: Booking;
  comm: number;
  bookingEmployeeId: string | null;
  overrideCents: number | null;
  isConfirmed: boolean;
  isPaid: boolean;
  customItems: BookingLineItem[];
  showCommission: boolean;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<string | null>(null);
  const [savingComm, setSavingComm] = useState(false);

  // Custom-line commission is split evenly across the installers who earn a
  // computed commission (tier yrittäjä/alihankkija, no manual override). The
  // Palkat row shows/edits each installer's SHARE so the breakdown reconciles
  // with the row total and the booking kate. Mirrors calculate_booking_commissions.
  const team = ((b as any).booking_employees as Array<{ employees?: { tier?: string } | null; commission_override_cents?: number | null }> | undefined) || [];
  const commissionSplitCount = Math.max(1, team.filter(
    (be) => (be.employees?.tier === "yrittaja" || be.employees?.tier === "alihankkija") && be.commission_override_cents == null
  ).length);

  const handleFieldBlur = async (item: BookingLineItem, field: "commission_cents" | "cost_cents", value: string) => {
    const cents = Math.round(parseFloat(value.replace(",", ".") || "0") * 100);
    const current = field === "commission_cents" ? (item.commission_cents || 0) : (item.cost_cents || 0);
    if (cents === current) return;
    setSaving(item.id);
    const { error } = await supabase
      .from("booking_line_items")
      .update({ [field]: cents })
      .eq("id", item.id);
    setSaving(null);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ["salary-bookings"] });
    }
  };

  // Editing the per-installer share stores share × split count as the shared
  // line total, which the DB trigger then re-splits back to each installer.
  const handleCustomShareBlur = async (item: BookingLineItem, value: string) => {
    const shareCents = Math.round(parseFloat(value.replace(",", ".") || "0") * 100);
    const lineCents = shareCents * commissionSplitCount;
    if (lineCents === (item.commission_cents || 0)) return;
    setSaving(item.id);
    const { error } = await supabase
      .from("booking_line_items")
      .update({ commission_cents: lineCents })
      .eq("id", item.id);
    setSaving(null);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ["salary-bookings"] });
    }
  };

  const handleCommissionBlur = async (value: string) => {
    if (!bookingEmployeeId) return;
    const trimmed = value.trim();
    const cents = Math.round(parseFloat(trimmed.replace(",", ".") || "0") * 100);
    // No-op if value is identical to what's already stored (override or computed)
    if (overrideCents !== null && cents === overrideCents) return;
    if (overrideCents === null && cents === comm) return;
    setSavingComm(true);
    const { error } = await supabase
      .from("booking_employees")
      .update({ commission_override_cents: cents })
      .eq("id", bookingEmployeeId);
    setSavingComm(false);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ["salary-bookings"] });
    }
  };

  const handleCommissionReset = async () => {
    if (!bookingEmployeeId || overrideCents === null) return;
    setSavingComm(true);
    const { error } = await supabase
      .from("booking_employees")
      .update({ commission_override_cents: null })
      .eq("id", bookingEmployeeId);
    setSavingComm(false);
    if (!error) {
      queryClient.invalidateQueries({ queryKey: ["salary-bookings"] });
    }
  };

  const isOverridden = overrideCents !== null;

  return (
    <>
      <tr className="border-t border-border/50">
        <td className="py-2 text-text-muted">#{b.booking_number}</td>
        <td className="py-2">{formatDate(b.booking_date)}</td>
        <td className="py-2">{b.services?.name || "-"}</td>
        <td className="py-2">
          {b.customers
            ? `${b.customers.first_name} ${b.customers.last_name}`
            : "-"}
        </td>
        <td className="py-2">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
            isConfirmed
              ? "bg-blue-100 text-blue-700"
              : "bg-green-100 text-green-700"
          }`}>
            {isConfirmed ? "Vahvistettu" : "Valmis"}
          </span>
        </td>
        <td className="py-2">
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide ${
            isPaid
              ? "bg-green-100 text-green-700"
              : "bg-orange-100 text-orange-700"
          }`}>
            {isPaid ? "Maksettu" : "Maksamatta"}
          </span>
        </td>
        <td className="py-2 text-right">{formatCents(b.price_cents)}</td>
        {showCommission && (
          <td className="py-2 text-right">
            <div className="inline-flex items-center justify-end gap-1">
              {isOverridden && (
                <button
                  type="button"
                  onClick={handleCommissionReset}
                  disabled={savingComm}
                  title="Palauta laskettuun arvoon"
                  className="text-amber-600 hover:text-amber-800 disabled:opacity-50"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
              <input
                key={`${bookingEmployeeId}-${comm}-${overrideCents ?? "auto"}`}
                type="text"
                inputMode="decimal"
                defaultValue={(comm / 100).toFixed(2).replace(".", ",")}
                placeholder="0,00"
                onBlur={(e) => handleCommissionBlur(e.target.value)}
                disabled={savingComm || !bookingEmployeeId}
                title={
                  isOverridden
                    ? "Manuaalisesti asetettu provisio. Klikkaa ↻ palauttaaksesi laskettuun arvoon."
                    : "Klikkaa muokataksesi (ylikirjoittaa lasketun arvon)"
                }
                className={`w-16 px-1.5 py-0.5 rounded-md border text-[12px] font-semibold text-right focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50 ${
                  isOverridden
                    ? "border-amber-400 bg-amber-50 text-amber-800"
                    : isConfirmed
                      ? "border-border bg-white text-text-muted"
                      : "border-border bg-white text-accent-dark"
                }`}
              />
              <span className="text-[10px] text-text-muted">€</span>
            </div>
            {isConfirmed && (
              <p className="text-[9px] text-text-muted leading-tight mt-0.5">tulossa</p>
            )}
          </td>
        )}
        <td className="py-2 text-right">
          <Link
            to={`/varaukset/${b.booking_number}`}
            className="text-text-muted hover:text-text-primary transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </Link>
        </td>
      </tr>
      {customItems.length > 0 && customItems.map((li) => (
        <tr key={li.id} className="bg-surface-alt/50">
          <td className="py-1.5 pl-6 text-[11px] text-text-muted" colSpan={2}>
            ↳ {li.name}
          </td>
          <td className="py-1.5 text-[11px] text-blue-500">[muu veloitus]</td>
          <td colSpan={2}></td>
          <td></td>
          <td className="py-1.5 text-right text-[11px] text-text-muted">
            {formatCents(li.price_cents * li.quantity)}
          </td>
          {showCommission && (
            <td className="py-1.5 text-right">
              <div className="inline-flex items-center gap-1.5">
                <div className="inline-flex flex-col items-end gap-0.5" title="Ostohinta">
                  <span className="text-[9px] text-text-muted uppercase tracking-wide">Osto</span>
                  <div className="inline-flex items-center gap-0.5">
                    <input
                      type="text"
                      inputMode="decimal"
                      defaultValue={li.cost_cents ? (li.cost_cents / 100).toFixed(2).replace(".", ",") : ""}
                      placeholder="0,00"
                      onBlur={(e) => handleFieldBlur(li, "cost_cents", e.target.value)}
                      disabled={saving === li.id}
                      className="w-14 px-1.5 py-0.5 rounded-md border border-border bg-white text-[11px] text-text-primary text-right focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
                    />
                    <span className="text-[10px] text-text-muted">€</span>
                  </div>
                </div>
                <div className="inline-flex flex-col items-end gap-0.5" title={commissionSplitCount > 1 ? `Provisio per asentaja (rivi ${formatCents(li.commission_cents || 0)} jaettu ${commissionSplitCount} kesken)` : "Provisio"}>
                  <span className="text-[9px] text-text-muted uppercase tracking-wide">Provisio{commissionSplitCount > 1 ? " /hlö" : ""}</span>
                  <div className="inline-flex items-center gap-0.5">
                    <input
                      key={`${li.id}-comm-${li.commission_cents}-${commissionSplitCount}`}
                      type="text"
                      inputMode="decimal"
                      defaultValue={li.commission_cents ? ((li.commission_cents / commissionSplitCount) / 100).toFixed(2).replace(".", ",") : ""}
                      placeholder="0,00"
                      onBlur={(e) => handleCustomShareBlur(li, e.target.value)}
                      disabled={saving === li.id}
                      className="w-14 px-1.5 py-0.5 rounded-md border border-border bg-white text-[11px] text-text-primary text-right focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50"
                    />
                    <span className="text-[10px] text-text-muted">€</span>
                  </div>
                </div>
              </div>
            </td>
          )}
          <td></td>
        </tr>
      ))}
    </>
  );
}

function SellerCommissionRow({ line }: { line: SellerCommissionLine }) {
  const setOverride = useSetSellerCommissionOverride();
  const resetOverride = useResetSellerCommissionOverride();
  const isOverridden = line.override_cents !== null;
  const effective = line.override_cents ?? line.computed_cents;
  const saving = setOverride.isPending || resetOverride.isPending;

  const handleBlur = (value: string) => {
    const cents = Math.round(parseFloat(value.trim().replace(",", ".") || "0") * 100);
    if (isOverridden && cents === line.override_cents) return;
    if (!isOverridden && cents === line.computed_cents) return;
    setOverride.mutate({ line, cents });
  };

  return (
    <tr className="border-t border-border/50">
      <td className="py-2">
        {line.booking_number != null ? (
          <Link to={`/varaukset/${line.booking_number}`} className="text-accent hover:underline">
            #{line.booking_number}
          </Link>
        ) : (
          <span className="text-text-muted">Diili</span>
        )}
      </td>
      <td className="py-2">{formatDate(line.commission_date)}</td>
      <td className="py-2">{line.customer_name || "-"}</td>
      <td className="py-2">
        <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-purple-50 text-purple-700">
          {line.source === "opportunity" ? "Diili" : "Suora"}
        </span>
      </td>
      <td className="py-2 text-right text-text-primary">{formatCents(line.total_cents)}</td>
      <td className="py-2 text-right">
        <div className="inline-flex items-center justify-end gap-1">
          {isOverridden && (
            <button
              type="button"
              onClick={() => resetOverride.mutate(line)}
              disabled={saving}
              title="Palauta laskettuun arvoon"
              className="text-amber-600 hover:text-amber-800 disabled:opacity-50"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          )}
          <input
            key={`${line.opportunity_id ?? line.booking_id}-${effective}`}
            type="text"
            inputMode="decimal"
            defaultValue={(effective / 100).toFixed(2).replace(".", ",")}
            placeholder="0,00"
            onBlur={(e) => handleBlur(e.target.value)}
            disabled={saving}
            title={
              isOverridden
                ? "Manuaalisesti asetettu provisio. Klikkaa ↻ palauttaaksesi laskettuun arvoon."
                : "Klikkaa muokataksesi (ylikirjoittaa lasketun arvon)"
            }
            className={`w-16 px-1.5 py-0.5 rounded-md border text-[12px] font-semibold text-right focus:outline-none focus:ring-2 focus:ring-accent/40 disabled:opacity-50 ${
              isOverridden
                ? "border-amber-400 bg-amber-50 text-amber-800"
                : "border-border bg-white text-purple-700"
            }`}
          />
          <span className="text-[10px] text-text-muted">€</span>
        </div>
      </td>
    </tr>
  );
}

// Build a map of employee_id -> bookings with their commission from booking_employees.
// Commission is stored as single source of truth in booking_employees.commission_cents
// (calculated by DB trigger on booking_line_items changes, or set via commission_override_cents).
interface BookingCommissionEntry {
  booking: Booking;
  commission: number;
  bookingEmployeeId: string | null;
  overrideCents: number | null;
}

function getEmployeeBookingsWithCommission(bookings: Booking[], employeeId: string): BookingCommissionEntry[] {
  const result: BookingCommissionEntry[] = [];
  for (const b of bookings) {
    const beList = (b as any).booking_employees as any[] | undefined;
    if (beList && beList.length > 0) {
      const be = beList.find((be: any) => be.employee_id === employeeId);
      if (be) {
        result.push({
          booking: b,
          commission: be.commission_cents || 0,
          bookingEmployeeId: be.id,
          overrideCents: be.commission_override_cents ?? null,
        });
      }
    } else if (b.employee_id === employeeId) {
      // Fallback: legacy booking without booking_employees — no commission data
      result.push({ booking: b, commission: 0, bookingEmployeeId: null, overrideCents: null });
    }
  }
  return result;
}

interface ContractSalesCommission {
  id: string;
  contract_id: string;
  employee_id: string;
  commission_cents: number;
  created_at: string;
  contracts: { id: string; customers: { first_name: string; last_name: string } | null } | null;
}

interface EmployeeEarnings {
  employee: Employee;
  bookings: Booking[];
  totalCommission: number;
  projectedCommission: number;
  paidCommission: number;
  unpaidCommission: number;
  contractSalesCommissionCents: number;
  contractSalesEntries: ContractSalesCommission[];
  salesCommissionCents: number;
  wonDeals: number;
  salesCommissionEntries: SellerCommissionLine[];
  manualCommission: number;
  manualEntries: ManualCommission[];
  baseSalary: number;
  // LVI TES overtime breakdown
  overtime: OvertimeBreakdown | null;
  employerCost: number;
  // Admin-only: sisäinen kulu (toinen yhtiö laskuttaa) per booking — palkallinen only.
  palkallinenInternalCostCents: number;
  palkallinenInternalCostPaidCents: number;
  palkallinenInternalCostUnpaidCents: number;
  palkallinenInternalCostProjectedCents: number;
  totalEarnings: number;
}

const EMPLOYER_SIDE_COST_MULTIPLIER = 1.30; // 30% sivukulut


export default function Salaries() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);

  const { from, to } = monthRange(year, month);
  const { data: bookings, isLoading: bookingsLoading } = useSalaryBookings(from, to);
  const { data: timeEntries } = useMonthTimeEntries(from, to);
  const { data: _contractVisits } = useContractVisitsForMonth(year, month);
  const { data: employees } = useEmployees();
  const { data: services } = useServices();
  const { data: sellerCommissionLines } = useSellerCommissionLines(from, to);
  const { data: manualCommissions } = useManualCommissions(from, to);
  const { data: contractSalesCommissions } = useQuery({
    queryKey: ["contract-sales-commissions", from, to],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_sales_commissions")
        .select("*, contracts(id, customers(first_name, last_name))")
        .gte("created_at", `${from}T00:00:00Z`)
        .lte("created_at", `${to}T23:59:59Z`);
      if (error) throw error;
      return (data ?? []) as ContractSalesCommission[];
    },
  });
  // Admin-only: palkallinen internal cost snapshots for the month (sidecar table).
  // RLS restricts read to admins; installers never see these rows.
  const { data: monthlyInternalCosts } = useQuery({
    queryKey: queryKeys.palkallinenInternalCosts.monthlySummary(`${year}-${month + 1}`),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_employee_internal_costs")
        .select("employee_id, internal_cost_cents, booking_id, bookings!inner(booking_date, status, payment_status, deleted_at)")
        .gte("bookings.booking_date", from)
        .lte("bookings.booking_date", to)
        .is("bookings.deleted_at", null)
        .in("bookings.status", ["completed", "confirmed"]);
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        employee_id: string;
        internal_cost_cents: number;
        booking_id: string;
        bookings: { status: string; payment_status: string | null };
      }>;
    },
  });

  const addManual = useAddManualCommission();
  const deleteManual = useDeleteManualCommission();

  // Group time entries by employee
  const timeEntriesByEmployee = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    if (!timeEntries) return map;
    for (const e of timeEntries) {
      const list = map.get(e.employee_id) || [];
      list.push(e);
      map.set(e.employee_id, list);
    }
    return map;
  }, [timeEntries]);

  const relevantEmployees = useMemo(
    () => (employees || []).filter((e) => (e.roles?.includes("installer") || e.roles?.includes("seller")) && e.active),
    [employees]
  );

  // Map salesperson_id -> per-deal commission lines (override-aware total computed from these)
  const sellerCommissionMap = useMemo(() => {
    const map = new Map<string, { commissionCents: number; wonDeals: number; lines: SellerCommissionLine[] }>();
    for (const line of sellerCommissionLines || []) {
      const existing = map.get(line.salesperson_id) || { commissionCents: 0, wonDeals: 0, lines: [] };
      existing.commissionCents += line.override_cents ?? line.computed_cents;
      existing.wonDeals += 1;
      existing.lines.push(line);
      map.set(line.salesperson_id, existing);
    }
    for (const v of map.values()) {
      v.lines.sort((a, b) => a.commission_date.localeCompare(b.commission_date));
    }
    return map;
  }, [sellerCommissionLines]);

  // Build a map of employee_id -> contract sales commission data
  const contractSalesCommByEmployee = useMemo(() => {
    const map = new Map<string, { total: number; entries: ContractSalesCommission[] }>();
    for (const csc of contractSalesCommissions || []) {
      const existing = map.get(csc.employee_id) || { total: 0, entries: [] };
      existing.total += csc.commission_cents;
      existing.entries.push(csc);
      map.set(csc.employee_id, existing);
    }
    return map;
  }, [contractSalesCommissions]);

  // Palkallinen internal costs (admin-only) aggregated per employee for the month.
  // Split by status/payment like subcontractor commissions: completed (+paid/unpaid) and projected.
  interface InternalCostBreakdown {
    total: number;       // realisoitunut (completed)
    paid: number;        // completed + paid
    unpaid: number;      // completed + unpaid
    projected: number;   // confirmed
  }
  const internalCostByEmployee = useMemo(() => {
    const map = new Map<string, InternalCostBreakdown>();
    for (const row of monthlyInternalCosts || []) {
      const existing = map.get(row.employee_id) || { total: 0, paid: 0, unpaid: 0, projected: 0 };
      const cents = row.internal_cost_cents || 0;
      if (row.bookings?.status === "completed") {
        existing.total += cents;
        if (row.bookings.payment_status === "paid") existing.paid += cents;
        else existing.unpaid += cents;
      } else {
        existing.projected += cents;
      }
      map.set(row.employee_id, existing);
    }
    return map;
  }, [monthlyInternalCosts]);

  // Manual commissions by employee
  const manualCommissionsByEmployee = useMemo(() => {
    const map = new Map<string, { total: number; entries: ManualCommission[] }>();
    for (const mc of manualCommissions || []) {
      const existing = map.get(mc.employee_id) || { total: 0, entries: [] };
      existing.total += mc.amount_cents;
      existing.entries.push(mc);
      map.set(mc.employee_id, existing);
    }
    return map;
  }, [manualCommissions]);

  const earnings: EmployeeEarnings[] = useMemo(() => {
    if (!bookings || !services) return [];

    return relevantEmployees.map((emp) => {
      const isInstaller = emp.roles?.includes("installer");
      const isPalkallinen = emp.tier === "palkallinen";
      const empBookingsWithComm = isInstaller ? getEmployeeBookingsWithCommission(bookings, emp.id) : [];
      const empBookings = empBookingsWithComm.map((e) => e.booking);

      let totalCommission = 0;
      let projectedCommission = 0;
      let paidCommission = 0;
      let unpaidCommission = 0;

      if (isInstaller && !isPalkallinen) {
        for (const { booking: b, commission: comm } of empBookingsWithComm) {
          if (b.status === "completed") {
            totalCommission += comm;
            if (b.payment_status === "paid") {
              paidCommission += comm;
            } else {
              unpaidCommission += comm;
            }
          } else {
            // confirmed → projected
            projectedCommission += comm;
          }
        }
      }

      // LVI TES overtime calculation for palkallinen
      const empTimeEntries = timeEntriesByEmployee.get(emp.id) || [];
      const overtime = isInstaller && isPalkallinen
        ? calcLviOvertime(empTimeEntries, emp.contract_weekly_hours || 0, emp.hourly_rate_cents || 0)
        : null;
      const baseSalary = overtime ? overtime.totalPay : 0;

      // Contract sales commissions (installer sold a contract on-site)
      const csc = contractSalesCommByEmployee.get(emp.id);
      const contractSalesCommissionCents = csc?.total || 0;
      const contractSalesEntries = csc?.entries || [];

      // Sales commissions (per-deal lines, override-aware)
      const sc = sellerCommissionMap.get(emp.id);
      const salesCommissionCents = sc ? sc.commissionCents : 0;
      const wonDeals = sc ? sc.wonDeals : 0;
      const salesCommissionEntries = sc ? sc.lines : [];

      // Manual commissions
      const mc = manualCommissionsByEmployee.get(emp.id);
      const manualCommission = mc?.total || 0;
      const manualEntries = mc?.entries || [];

      const picBreak = isPalkallinen ? internalCostByEmployee.get(emp.id) : undefined;
      const palkallinenInternalCostCents = picBreak?.total || 0;
      const palkallinenInternalCostPaidCents = picBreak?.paid || 0;
      const palkallinenInternalCostUnpaidCents = picBreak?.unpaid || 0;
      const palkallinenInternalCostProjectedCents = picBreak?.projected || 0;

      return {
        employee: emp,
        bookings: empBookings,
        totalCommission,
        projectedCommission,
        paidCommission,
        unpaidCommission,
        contractSalesCommissionCents,
        contractSalesEntries,
        salesCommissionCents,
        wonDeals,
        salesCommissionEntries,
        manualCommission,
        manualEntries,
        baseSalary,
        overtime,
        employerCost: isPalkallinen ? Math.round(baseSalary * EMPLOYER_SIDE_COST_MULTIPLIER) : 0,
        palkallinenInternalCostCents,
        palkallinenInternalCostPaidCents,
        palkallinenInternalCostUnpaidCents,
        palkallinenInternalCostProjectedCents,
        // Palkalliset: actual cost to Lasikiilto is the internal invoice (toisen yhtiön laskutus),
        // not the computed gross salary. Show internal cost in place of palkka.
        totalEarnings: totalCommission + contractSalesCommissionCents + (isPalkallinen ? palkallinenInternalCostCents : baseSalary) + salesCommissionCents + manualCommission,
      };
    }).sort((a, b) => b.totalEarnings - a.totalEarnings);
  }, [bookings, relevantEmployees, services, contractSalesCommByEmployee, timeEntriesByEmployee, sellerCommissionMap, manualCommissionsByEmployee, internalCostByEmployee]);

  const grandTotal = earnings.reduce((sum, e) => sum + e.totalEarnings, 0);
  const grandProjected = earnings.reduce((sum, e) => sum + e.projectedCommission + e.palkallinenInternalCostProjectedCents, 0);
  const totalBookings = earnings.reduce((sum, e) => sum + e.bookings.length, 0);

  function prevMonth() {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  }
  function nextMonth() {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <Wallet className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Palkat & provisiot</h1>
        </div>
        {earnings.length > 0 && (
          <button
            onClick={() => {
              const rows: string[][] = [];
              for (const item of earnings) {
                const emp = item.employee;
                if (item.totalEarnings === 0) continue;
                const isSeller = emp.roles?.includes("seller");
                const isInst = emp.roles?.includes("installer");
                const role = isSeller && isInst ? `${TIER_LABELS[emp.tier!] || emp.tier || ""} / Myyjä` : isSeller ? "Myyjä" : (emp.tier ? TIER_LABELS[emp.tier] : "") || "";
                rows.push([
                  `${emp.first_name} ${emp.last_name}`,
                  role,
                  String(item.bookings.length + item.wonDeals),
                  String(((item.totalCommission + item.salesCommissionCents) / 100).toFixed(2)),
                  String((item.projectedCommission / 100).toFixed(2)),
                  String((item.contractSalesCommissionCents / 100).toFixed(2)),
                  String((item.palkallinenInternalCostCents / 100).toFixed(2)),
                  String((item.palkallinenInternalCostProjectedCents / 100).toFixed(2)),
                  String((item.totalEarnings / 100).toFixed(2)),
                ]);
              }
              downloadCsv(
                `palkat-${MONTH_NAMES_FI[month]}-${year}.csv`,
                ["Henkilö", "Rooli", "Keikkoja/Diilejä", "Provisiot €", "Tulossa €", "Sopimusmyynti €", "Sisäinen kulu €", "Sisäinen kulu tulossa €", "Yhteensä €"],
                rows
              );
            }}
            className="inline-flex items-center gap-2 px-4 py-2 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors whitespace-nowrap"
          >
            <Download className="w-4 h-4" /> CSV
          </button>
        )}
      </div>

      {/* Month selector */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={prevMonth}
          className="px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-surface-hover transition-colors"
        >
          &larr;
        </button>
        <div className="text-center min-w-[160px]">
          <p className="text-lg font-bold text-text-primary">{MONTH_NAMES_FI[month]}</p>
          <p className="text-xs text-text-muted">{year}</p>
        </div>
        <button
          onClick={nextMonth}
          className="px-3 py-2 rounded-xl border border-border text-sm font-medium hover:bg-surface-hover transition-colors"
        >
          &rarr;
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div className="bg-surface rounded-2xl border border-border p-4 sm:p-5">
          <p className="text-xs text-text-muted uppercase tracking-wide mb-1">Toteutunut</p>
          <p className="text-lg sm:text-2xl font-bold text-accent-dark">{formatCents(grandTotal)}</p>
        </div>
        <div className="bg-surface rounded-2xl border border-border p-4 sm:p-5">
          <p className="text-xs text-text-muted uppercase tracking-wide mb-1">Tulossa</p>
          <p className="text-lg sm:text-2xl font-bold text-text-muted">{formatCents(grandProjected)}</p>
        </div>
        <div className="bg-surface rounded-2xl border border-border p-4 sm:p-5">
          <p className="text-xs text-text-muted uppercase tracking-wide mb-1">Keikkoja</p>
          <p className="text-lg sm:text-2xl font-bold text-text-primary">{totalBookings}</p>
        </div>
        <div className="bg-surface rounded-2xl border border-border p-4 sm:p-5">
          <p className="text-xs text-text-muted uppercase tracking-wide mb-1">Henkilöt</p>
          <p className="text-lg sm:text-2xl font-bold text-text-primary">{earnings.filter((e) => e.totalEarnings > 0).length}</p>
        </div>
      </div>

      {bookingsLoading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-surface rounded-2xl" />)}
        </div>
      ) : (
        <div className="space-y-3">
          {earnings.map((item) => {
            const isExpanded = expandedEmployee === item.employee.id;
            const emp = item.employee;

            return (
              <div
                key={emp.id}
                className="bg-surface rounded-2xl border border-border overflow-hidden"
              >
                {/* Employee row */}
                <button
                  onClick={() => setExpandedEmployee(isExpanded ? null : emp.id)}
                  className="w-full flex items-center gap-4 p-5 text-left hover:bg-surface-hover/50 transition-colors"
                >
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-text-muted flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-text-muted flex-shrink-0" />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-text-primary truncate">
                        {emp.first_name} {emp.last_name}
                      </p>
                      {emp.tier && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-surface-hover text-text-muted flex-shrink-0">
                          {TIER_LABELS[emp.tier] || emp.tier}
                        </span>
                      )}
                      {emp.roles?.includes("seller") && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide bg-purple-50 text-purple-700 flex-shrink-0">
                          Myyjä
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted">
                      {item.bookings.length > 0 && <>{item.bookings.length} keikkaa</>}
                      {item.bookings.length > 0 && item.wonDeals > 0 && " · "}
                      {item.wonDeals > 0 && <>{item.wonDeals} diiliä</>}
                      {item.overtime && item.overtime.workedHours > 0 && (
                        <> · {item.overtime.workedHours.toFixed(1)} h / {item.overtime.normalHours.toFixed(0)} h</>
                      )}
                      {item.bookings.length === 0 && item.wonDeals === 0 && "Ei aktiviteettia"}
                    </p>
                  </div>

                  <div className="text-right flex-shrink-0 max-w-[140px] sm:max-w-none">
                    <p className="text-base sm:text-lg font-bold text-accent-dark">{formatCents(item.totalEarnings)}</p>
                    {item.unpaidCommission > 0 && (
                      <p className="text-[10px] text-orange-500 font-medium">
                        {formatCents(item.unpaidCommission)} maksamatta
                      </p>
                    )}
                    {item.projectedCommission > 0 && (
                      <p className="text-[10px] text-text-muted">
                        + {formatCents(item.projectedCommission)} tulossa
                      </p>
                    )}
                    {item.salesCommissionCents > 0 && (
                      <p className="text-[10px] text-purple-600 font-medium">
                        sis. myyntiprovisiot {formatCents(item.salesCommissionCents)}
                      </p>
                    )}
                    {item.contractSalesCommissionCents > 0 && (
                      <p className="text-[10px] text-blue-600 font-medium">
                        sis. sopimusmyynti {formatCents(item.contractSalesCommissionCents)}
                      </p>
                    )}
                    {item.manualCommission !== 0 && (
                      <p className="text-[10px] text-teal-600 font-medium">
                        sis. muut {formatCents(item.manualCommission)}
                      </p>
                    )}
                    {emp.tier === "palkallinen" && item.palkallinenInternalCostUnpaidCents > 0 && (
                      <p className="text-[10px] text-orange-500 font-medium">
                        {formatCents(item.palkallinenInternalCostUnpaidCents)} maksamatta
                      </p>
                    )}
                    {emp.tier === "palkallinen" && item.palkallinenInternalCostProjectedCents > 0 && (
                      <p className="text-[10px] text-text-muted">
                        + {formatCents(item.palkallinenInternalCostProjectedCents)} tulossa
                      </p>
                    )}
                  </div>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border px-5 pb-5">
                    {/* Breakdown */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 py-4">
                      {item.overtime && (
                        <div>
                          <p className="text-[10px] text-text-muted uppercase tracking-wide">Tehdyt tunnit</p>
                          <p className="text-sm font-bold text-text-primary">
                            {item.overtime.workedHours.toFixed(1)} h
                          </p>
                        </div>
                      )}
                      {emp.tier !== "palkallinen" && (
                        <div>
                          <p className="text-[10px] text-text-muted uppercase tracking-wide">Keikkaprovisiot</p>
                          <p className="text-sm font-bold text-text-primary">{formatCents(item.totalCommission)}</p>
                          {item.totalCommission > 0 && (
                            <div className="flex gap-2 mt-0.5">
                              <span className="text-[10px] text-green-600">{formatCents(item.paidCommission)} maksettu</span>
                              {item.unpaidCommission > 0 && (
                                <span className="text-[10px] text-orange-500">{formatCents(item.unpaidCommission)} maksamatta</span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                      {item.salesCommissionCents > 0 && (
                        <div>
                          <p className="text-[10px] text-text-muted uppercase tracking-wide">Myyntiprovisiot</p>
                          <p className="text-sm font-bold text-purple-700">{formatCents(item.salesCommissionCents)}</p>
                          <p className="text-[10px] text-text-muted">{item.wonDeals} voitettua diiliä</p>
                        </div>
                      )}
                      {item.contractSalesCommissionCents > 0 && (
                        <div>
                          <p className="text-[10px] text-text-muted uppercase tracking-wide">Sopimusmyyntiprovisiot</p>
                          <p className="text-sm font-bold text-blue-700">{formatCents(item.contractSalesCommissionCents)}</p>
                          <p className="text-[10px] text-text-muted">{item.contractSalesEntries.length} sopimusta</p>
                        </div>
                      )}
                      {item.manualCommission !== 0 && (
                        <div>
                          <p className="text-[10px] text-text-muted uppercase tracking-wide">Muut provisiot</p>
                          <p className="text-sm font-bold text-teal-700">{formatCents(item.manualCommission)}</p>
                          <p className="text-[10px] text-text-muted">{item.manualEntries.length} merkintää</p>
                        </div>
                      )}
                      {item.projectedCommission > 0 && (
                        <div>
                          <p className="text-[10px] text-text-muted uppercase tracking-wide">Tulossa</p>
                          <p className="text-sm font-bold text-text-muted">{formatCents(item.projectedCommission)}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[10px] text-text-muted uppercase tracking-wide">Yhteensä</p>
                        <p className="text-sm font-bold text-accent-dark">{formatCents(item.totalEarnings)}</p>
                      </div>
                      {(item.palkallinenInternalCostCents > 0 || item.palkallinenInternalCostProjectedCents > 0) && (
                        <div>
                          <p className="text-[10px] text-text-muted uppercase tracking-wide">Sisäinen kulu</p>
                          <p className="text-sm font-bold text-purple-700">{formatCents(item.palkallinenInternalCostCents)}</p>
                          {item.palkallinenInternalCostCents > 0 && (
                            <div className="flex gap-2 mt-0.5">
                              <span className="text-[10px] text-green-600">{formatCents(item.palkallinenInternalCostPaidCents)} maksettu</span>
                              {item.palkallinenInternalCostUnpaidCents > 0 && (
                                <span className="text-[10px] text-orange-500">{formatCents(item.palkallinenInternalCostUnpaidCents)} maksamatta</span>
                              )}
                            </div>
                          )}
                          {item.palkallinenInternalCostProjectedCents > 0 && (
                            <p className="text-[10px] text-text-muted mt-0.5">Tulossa {formatCents(item.palkallinenInternalCostProjectedCents)}</p>
                          )}
                          <p className="text-[10px] text-text-muted">toisen yhtiön laskutus</p>
                        </div>
                      )}
                    </div>

                    {/* Booking list */}
                    {item.bookings.length > 0 ? (
                      <div>
                        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Keikat</p>

                        {/* Desktop table */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-text-muted uppercase tracking-wide">
                                <th className="pb-2 font-medium">#</th>
                                <th className="pb-2 font-medium">Pvm</th>
                                <th className="pb-2 font-medium">Palvelu</th>
                                <th className="pb-2 font-medium">Asiakas</th>
                                <th className="pb-2 font-medium">Tila</th>
                                <th className="pb-2 font-medium">Maksu</th>
                                <th className="pb-2 font-medium text-right">Hinta</th>
                                {emp.tier !== "palkallinen" && (
                                  <th className="pb-2 font-medium text-right">Provisio</th>
                                )}
                                <th className="pb-2 font-medium"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.bookings.map((b) => {
                                const empComm = getEmployeeBookingsWithCommission([b], emp.id);
                                const entry = empComm.length > 0 ? empComm[0] : null;
                                const comm = entry?.commission ?? 0;
                                const bookingEmployeeId = entry?.bookingEmployeeId ?? null;
                                const overrideCents = entry?.overrideCents ?? null;
                                const isConfirmed = b.status === "confirmed";
                                const isPaid = b.payment_status === "paid";
                                const customItems = ((b as any).booking_line_items as BookingLineItem[] | undefined)?.filter(
                                  (li) => li.line_type === "custom"
                                ) || [];
                                return (
                                  <SalaryBookingRow
                                    key={b.id}
                                    booking={b}
                                    comm={comm}
                                    bookingEmployeeId={bookingEmployeeId}
                                    overrideCents={overrideCents}
                                    isConfirmed={isConfirmed}
                                    isPaid={isPaid}
                                    customItems={customItems}
                                    showCommission={emp.tier !== "palkallinen"}
                                  />
                                );
                              })}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile cards */}
                        <div className="md:hidden space-y-2">
                          {item.bookings.map((b) => {
                            const empComm = getEmployeeBookingsWithCommission([b], emp.id);
                            const entry = empComm.length > 0 ? empComm[0] : null;
                            const comm = entry?.commission ?? 0;
                            const isOverridden = entry?.overrideCents != null;
                            const isConfirmed = b.status === "confirmed";
                            const isPaid = b.payment_status === "paid";
                            return (
                              <Link
                                key={b.id}
                                to={`/varaukset/${b.booking_number}`}
                                className="flex items-center justify-between p-3 rounded-xl bg-surface-hover/50 hover:bg-surface-hover transition-colors"
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <p className="text-sm font-medium text-text-primary truncate">
                                      {b.services?.name || "-"}
                                    </p>
                                    <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide flex-shrink-0 ${
                                      isConfirmed
                                        ? "bg-blue-100 text-blue-700"
                                        : "bg-green-100 text-green-700"
                                    }`}>
                                      {isConfirmed ? "Vahvistettu" : "Valmis"}
                                    </span>
                                    <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[9px] font-semibold uppercase tracking-wide flex-shrink-0 ${
                                      isPaid
                                        ? "bg-green-100 text-green-700"
                                        : "bg-orange-100 text-orange-700"
                                    }`}>
                                      {isPaid ? "Maksettu" : "Maksamatta"}
                                    </span>
                                  </div>
                                  <p className="text-xs text-text-muted">
                                    #{b.booking_number} · {formatDate(b.booking_date)}
                                  </p>
                                </div>
                                <div className="text-right flex-shrink-0 ml-3">
                                  {emp.tier === "palkallinen" ? (
                                    <p className="text-sm font-bold text-text-primary">{formatCents(b.price_cents)}</p>
                                  ) : isConfirmed ? (
                                    <>
                                      <p className={`text-sm font-bold ${isOverridden ? "text-amber-700" : "text-text-muted"}`}>
                                        {formatCents(comm)}
                                      </p>
                                      <p className="text-[10px] text-text-muted">{isOverridden ? "manuaalinen · tulossa" : "tulossa"}</p>
                                    </>
                                  ) : (
                                    <>
                                      <p className={`text-sm font-bold ${isOverridden ? "text-amber-700" : "text-accent-dark"}`}>
                                        {formatCents(comm)}
                                      </p>
                                      <p className="text-[10px] text-text-muted">
                                        {isOverridden ? "manuaalinen · " : ""}{formatCents(b.price_cents)}
                                      </p>
                                    </>
                                  )}
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-text-muted py-2">Ei keikkoja talla kaudella</p>
                    )}

                    {/* Sales commission breakdown (per deal / direct booking) */}
                    {item.salesCommissionEntries.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Myyntiprovisiot</p>

                        {/* Desktop table */}
                        <div className="hidden md:block overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-left text-xs text-text-muted uppercase tracking-wide">
                                <th className="pb-2 font-medium">Varaus</th>
                                <th className="pb-2 font-medium">Pvm</th>
                                <th className="pb-2 font-medium">Asiakas</th>
                                <th className="pb-2 font-medium">Tyyppi</th>
                                <th className="pb-2 font-medium text-right">Kokonaissumma</th>
                                <th className="pb-2 font-medium text-right">Provisio</th>
                              </tr>
                            </thead>
                            <tbody>
                              {item.salesCommissionEntries.map((line) => (
                                <SellerCommissionRow key={line.opportunity_id ?? line.booking_id} line={line} />
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile cards */}
                        <div className="md:hidden space-y-2">
                          {item.salesCommissionEntries.map((line) => {
                            const isOverridden = line.override_cents !== null;
                            const effective = line.override_cents ?? line.computed_cents;
                            return (
                              <div
                                key={line.opportunity_id ?? line.booking_id}
                                className="flex items-center justify-between p-3 rounded-xl bg-surface-hover/50"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-text-primary truncate">
                                    {line.customer_name || (line.source === "opportunity" ? "Diili" : "Suora varaus")}
                                  </p>
                                  <p className="text-xs text-text-muted">
                                    {line.booking_number != null && (
                                      <Link to={`/varaukset/${line.booking_number}`} className="text-accent hover:underline">
                                        #{line.booking_number}
                                      </Link>
                                    )}
                                    {line.booking_number != null && " · "}
                                    {formatDate(line.commission_date)}
                                  </p>
                                </div>
                                <div className="text-right flex-shrink-0 ml-3">
                                  <p className={`text-sm font-bold ${isOverridden ? "text-amber-700" : "text-purple-700"}`}>
                                    {formatCents(effective)}
                                  </p>
                                  <p className="text-[10px] text-text-muted">summa {formatCents(line.total_cents)}</p>
                                  {isOverridden && <p className="text-[10px] text-text-muted">manuaalinen</p>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        <p className="text-[10px] text-text-muted mt-1">
                          Muokkaa provisiota työpöytänäkymässä (klikkaa summaa).
                        </p>
                      </div>
                    )}

                    {/* Manual commissions */}
                    <div className="mt-4">
                      <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Muut provisiot</p>
                      {item.manualEntries.length > 0 && (
                        <div className="space-y-1.5 mb-3">
                          {item.manualEntries.map((mc) => (
                            <div key={mc.id} className="flex items-center justify-between p-2.5 rounded-xl bg-surface-hover/50">
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-text-primary">
                                  {mc.description}
                                  {mc.bookings?.booking_number && (
                                    <Link to={`/varaukset/${mc.bookings.booking_number}`} className="ml-1.5 text-accent hover:underline text-xs">
                                      #{mc.bookings.booking_number}
                                    </Link>
                                  )}
                                </p>
                                <p className="text-[10px] text-text-muted">{formatDate(mc.commission_date)}</p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                <span className={`text-sm font-bold ${mc.amount_cents >= 0 ? "text-teal-700" : "text-red-600"}`}>
                                  {formatCents(mc.amount_cents)}
                                </span>
                                <button
                                  onClick={() => deleteManual.mutate(mc.id)}
                                  className="p-1 text-text-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <ManualCommissionForm
                        employeeId={emp.id}
                        defaultDate={`${year}-${String(month + 1).padStart(2, "0")}-15`}
                        bookings={item.bookings}
                        onAdd={(input) => addManual.mutate(input)}
                        isPending={addManual.isPending}
                      />
                    </div>

                    <Link
                      to={`/tyontekijat/${emp.id}`}
                      className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors mt-3"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Tyontekijan tiedot
                    </Link>
                  </div>
                )}
              </div>
            );
          })}

          {earnings.length === 0 && (
            <div className="bg-surface rounded-2xl border border-border p-8 text-center">
              <p className="text-text-muted">Ei aktiivisia työntekijöitä</p>
            </div>
          )}
        </div>
      )}

    </div>
  );
}

// ─── Inline form for adding a manual commission ───

function ManualCommissionForm({
  employeeId,
  defaultDate,
  bookings,
  onAdd,
  isPending,
}: {
  employeeId: string;
  defaultDate: string;
  bookings: Booking[];
  onAdd: (input: { employee_id: string; amount_cents: number; description: string; commission_date: string; booking_id?: string | null }) => void;
  isPending: boolean;
}) {
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(defaultDate);
  const [bookingId, setBookingId] = useState("");

  function handleSubmit() {
    const cents = Math.round(parseFloat(amount.replace(",", ".") || "0") * 100);
    if (!description.trim() || cents === 0) return;
    onAdd({
      employee_id: employeeId,
      amount_cents: cents,
      description: description.trim(),
      commission_date: date,
      booking_id: bookingId || null,
    });
    setDescription("");
    setAmount("");
    setBookingId("");
  }

  const fieldCls = "w-full px-3 py-2 rounded-xl border border-border bg-white text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-accent/40 transition-colors";

  return (
    <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 items-end">
      <div>
        <label className="text-[10px] text-text-muted uppercase tracking-wide mb-1 block">Kuvaus</label>
        <input
          type="text"
          placeholder="Esim. bonus, kulukorvaus…"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={fieldCls}
        />
      </div>
      <div>
        <label className="text-[10px] text-text-muted uppercase tracking-wide mb-1 block">Summa €</label>
        <input
          type="text"
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className={`${fieldCls} w-24`}
        />
      </div>
      <div>
        <label className="text-[10px] text-text-muted uppercase tracking-wide mb-1 block">Varaus</label>
        <select
          value={bookingId}
          onChange={(e) => setBookingId(e.target.value)}
          className={`${fieldCls} w-36`}
        >
          <option value="">– Ei varausta –</option>
          {bookings.map((b) => (
            <option key={b.id} value={b.id}>
              #{b.booking_number} {formatDate(b.booking_date)}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-[10px] text-text-muted uppercase tracking-wide mb-1 block">Pvm</label>
        <DatePicker value={date} onChange={setDate} className="w-36" />
      </div>
      <div>
        <label className="text-[10px] text-text-muted uppercase tracking-wide mb-1 block">&nbsp;</label>
        <button
          onClick={handleSubmit}
          disabled={isPending || !description.trim() || !amount}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold bg-accent text-white hover:bg-accent-dark transition-colors disabled:opacity-50 whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" /> Lisää
        </button>
      </div>
    </div>
  );
}
