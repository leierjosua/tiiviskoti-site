import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Link2, Copy, Check, ExternalLink } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useEmployees } from "@/hooks/useEmployees";
import { queryKeys } from "@/lib/queryKeys";
import { formatCents } from "@/lib/utils";

interface RefRow {
  ref_code: string;
  employee_id: string | null;
  employee_name: string | null;
  bookings: number;
  booking_revenue_cents: number;
  form_submissions: number;
}

function useRefStats(from: string, to: string) {
  return useQuery({
    queryKey: queryKeys.sales.refStats(from, to),
    queryFn: async (): Promise<RefRow[]> => {
      // Fetch employees with ref codes for mapping
      const { data: employees } = await supabase
        .from("employees")
        .select("id, first_name, last_name, ref_code")
        .not("ref_code", "is", null);

      // Map ref → employee. Keys are lowercased because ?ref= values come from
      // flyer/QR links and are matched case-insensitively.
      const refMap = new Map<string, { id: string; name: string }>(
        (employees || []).map((e) => [
          e.ref_code!.toLowerCase(),
          { id: e.id, name: `${e.first_name} ${e.last_name}` },
        ]),
      );

      // Flyer QR codes carry the DISCOUNT code as the ref (e.g. ?ref=josse), not
      // the employee's personal ref_code. Resolve those to the linked employee so
      // flyer/influencer traffic is attributed correctly.
      const { data: discountCodes } = await supabase
        .from("discount_codes")
        .select("code, employee_id, employees(id, first_name, last_name)")
        .not("employee_id", "is", null);

      type EmpRel = { id: string; first_name: string; last_name: string };
      for (const dc of discountCodes || []) {
        // PostgREST embeds the related row as an array in the generated types;
        // at runtime this FK is to-one, so take the first element if it's an array.
        const empRaw = (dc as unknown as { employees?: EmpRel | EmpRel[] | null }).employees;
        const emp = Array.isArray(empRaw) ? empRaw[0] : empRaw;
        const key = (dc.code as string)?.toLowerCase();
        if (key && emp && !refMap.has(key)) {
          refMap.set(key, { id: emp.id, name: `${emp.first_name} ${emp.last_name}` });
        }
      }

      // Fetch bookings with seller_ref
      const { data: bookings } = await supabase
        .from("bookings")
        .select("seller_ref, price_cents")
        .not("seller_ref", "is", null)
        .gte("created_at", from)
        .lte("created_at", to + "T23:59:59");

      // Fetch form submissions with seller_ref
      const { data: forms } = await supabase
        .from("form_submissions")
        .select("seller_ref")
        .not("seller_ref", "is", null)
        .gte("created_at", from)
        .lte("created_at", to + "T23:59:59");

      // Aggregate by ref code
      const agg = new Map<string, { bookings: number; revenue: number; forms: number }>();

      for (const b of bookings || []) {
        const ref = b.seller_ref as string;
        const cur = agg.get(ref) || { bookings: 0, revenue: 0, forms: 0 };
        cur.bookings += 1;
        cur.revenue += b.price_cents || 0;
        agg.set(ref, cur);
      }

      for (const f of forms || []) {
        const ref = f.seller_ref as string;
        const cur = agg.get(ref) || { bookings: 0, revenue: 0, forms: 0 };
        cur.forms += 1;
        agg.set(ref, cur);
      }

      // Also include ref codes from employees that have no activity yet
      for (const [code] of refMap) {
        if (!agg.has(code)) {
          agg.set(code, { bookings: 0, revenue: 0, forms: 0 });
        }
      }

      return Array.from(agg.entries())
        .map(([ref, stats]) => {
          const emp = refMap.get(ref.toLowerCase());
          return {
            ref_code: ref,
            employee_id: emp?.id || null,
            employee_name: emp?.name || null,
            bookings: stats.bookings,
            booking_revenue_cents: stats.revenue,
            form_submissions: stats.forms,
          };
        })
        .sort((a, b) => b.bookings + b.form_submissions - (a.bookings + a.form_submissions));
    },
  });
}

function getDateRange(period: string): { from: string; to: string } {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  if (period === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return { from: d.toISOString().slice(0, 10), to };
  }
  if (period === "year") {
    return { from: `${now.getFullYear()}-01-01`, to };
  }
  if (period === "all") {
    return { from: "2020-01-01", to };
  }
  // month
  const d = new Date(now);
  d.setMonth(d.getMonth() - 1);
  return { from: d.toISOString().slice(0, 10), to };
}

export default function SellerRefStats() {
  const [period, setPeriod] = useState("month");
  const { from, to } = useMemo(() => getDateRange(period), [period]);
  const { data: rows = [], isLoading } = useRefStats(from, to);
  const { data: employees = [] } = useEmployees("seller");
  const [copiedRef, setCopiedRef] = useState<string | null>(null);

  const sellersWithoutRef = employees.filter(
    (e) => e.active && !e.ref_code && e.roles?.includes("seller"),
  );

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        bookings: acc.bookings + r.bookings,
        revenue: acc.revenue + r.booking_revenue_cents,
        forms: acc.forms + r.form_submissions,
      }),
      { bookings: 0, revenue: 0, forms: 0 },
    );
  }, [rows]);

  function copyLink(refCode: string) {
    navigator.clipboard.writeText(`https://lasikiilto.fi/?ref=${refCode}`);
    setCopiedRef(refCode);
    setTimeout(() => setCopiedRef(null), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Link2 className="w-6 h-6 text-accent" />
            Viitekoodiseuranta
          </h1>
          <p className="text-sm text-text-muted mt-1">
            Myyjien landing page -linkkien kautta tulleet varaukset ja yhteydenotot
          </p>
        </div>
        <div className="flex gap-1 bg-surface border border-border rounded-xl p-1">
          {[
            { value: "week", label: "Viikko" },
            { value: "month", label: "Kuukausi" },
            { value: "year", label: "Vuosi" },
            { value: "all", label: "Kaikki" },
          ].map((opt) => (
            <button
              key={opt.value}
              onClick={() => setPeriod(opt.value)}
              className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${
                period === opt.value
                  ? "bg-accent text-white font-medium"
                  : "text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-surface border border-border rounded-2xl p-5">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Varaukset</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{totals.bookings}</p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-5">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Liikevaihto</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{formatCents(totals.revenue)}</p>
        </div>
        <div className="bg-surface border border-border rounded-2xl p-5">
          <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Yhteydenotot</p>
          <p className="text-2xl font-bold text-text-primary mt-1">{totals.forms}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface border border-border rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-surface-hover/50">
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Myyjä</th>
                <th className="px-6 py-3.5 text-left text-xs font-semibold text-text-muted uppercase tracking-wider">Ref-koodi</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-text-muted uppercase tracking-wider">Varaukset</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-text-muted uppercase tracking-wider">Liikevaihto</th>
                <th className="px-6 py-3.5 text-right text-xs font-semibold text-text-muted uppercase tracking-wider">Yhteydenotot</th>
                <th className="px-6 py-3.5 text-center text-xs font-semibold text-text-muted uppercase tracking-wider">Linkki</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-text-muted">Ladataan...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-12 text-center text-text-muted">Ei vielä viitekoodidataa</td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.ref_code} className="border-b border-border hover:bg-surface-hover transition-colors">
                    <td className="px-6 py-4 text-sm text-text-primary font-medium">
                      {row.employee_id ? (
                        <Link to={`/tyontekijat/${row.employee_id}`} className="hover:text-accent transition-colors">
                          {row.employee_name}
                        </Link>
                      ) : (
                        <span className="text-text-muted italic">Ei linkitetty</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <code className="text-sm bg-surface-hover px-2 py-0.5 rounded-md">{row.ref_code}</code>
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-medium text-text-primary">{row.bookings}</td>
                    <td className="px-6 py-4 text-sm text-right text-text-secondary">{formatCents(row.booking_revenue_cents)}</td>
                    <td className="px-6 py-4 text-sm text-right text-text-secondary">{row.form_submissions}</td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => copyLink(row.ref_code)}
                        className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        {copiedRef === row.ref_code ? (
                          <><Check className="w-3.5 h-3.5" /> Kopioitu</>
                        ) : (
                          <><Copy className="w-3.5 h-3.5" /> Kopioi</>
                        )}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Warning for sellers without ref codes */}
      {sellersWithoutRef.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
          <p className="text-sm font-medium text-amber-800 mb-2">
            {sellersWithoutRef.length} myyjällä ei ole viitekoodia:
          </p>
          <div className="flex flex-wrap gap-2">
            {sellersWithoutRef.map((e) => (
              <Link
                key={e.id}
                to={`/tyontekijat/${e.id}`}
                className="inline-flex items-center gap-1 text-sm text-amber-700 hover:text-amber-900 bg-amber-100 px-2.5 py-1 rounded-lg"
              >
                {e.first_name} {e.last_name}
                <ExternalLink className="w-3 h-3" />
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
