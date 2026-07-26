import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { Ticket, ChevronDown, ChevronRight, Euro, ExternalLink } from "lucide-react";
import { useUserRole } from "@/context/UserRoleContext";
import { useSellerDiscountCodes, useDiscountCodeBookings } from "@/hooks/useDiscountCodes";
import { Badge } from "@/components/ui/badge";
import { formatCents, formatDate, formatDateTime, STATUS_LABELS, STATUS_COLORS } from "@/lib/utils";
import type { DiscountCode } from "@/lib/types";

function formatDiscount(dc: DiscountCode) {
  if (dc.discount_type === "eur") return formatCents(dc.discount_value);
  return `${dc.discount_value} %`;
}

function CodeUsageHistory({ codeId }: { codeId: string }) {
  const { data: bookings, isLoading } = useDiscountCodeBookings(codeId);

  if (isLoading) {
    return <p className="text-xs text-text-muted py-2">Ladataan...</p>;
  }
  if (!bookings || bookings.length === 0) {
    return <p className="text-sm text-text-muted py-2">Ei käyttöjä</p>;
  }

  return (
    <div className="space-y-1.5">
      {bookings.map((b) => {
        const target = b.opportunity_id ? `/myyja/inbound/${b.opportunity_id}` : null;
        const content = (
          <>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text-primary truncate">
                #{b.booking_number} · {b.customers ? `${b.customers.first_name} ${b.customers.last_name}` : "–"}
              </p>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-xs text-text-muted">Käytetty {formatDateTime(b.created_at)}</span>
                <span className="text-xs text-text-muted">· Keikka {formatDate(b.booking_date)}</span>
                <Badge className={`text-[10px] px-1.5 py-0 ${STATUS_COLORS[b.status] || "bg-gray-50 text-gray-600 border border-gray-200"}`}>
                  {STATUS_LABELS[b.status] || b.status}
                </Badge>
              </div>
            </div>
            <div className="text-right flex-shrink-0 ml-3 flex items-center gap-2">
              <span className="text-sm font-semibold text-accent-dark">-{formatCents(b.discount_amount_cents)}</span>
              {target && <ExternalLink className="w-3.5 h-3.5 text-text-muted" />}
            </div>
          </>
        );
        return target ? (
          <Link
            key={b.id}
            to={target}
            className="flex items-center justify-between p-2.5 rounded-xl hover:bg-surface-hover transition-colors"
          >
            {content}
          </Link>
        ) : (
          <div
            key={b.id}
            className="flex items-center justify-between p-2.5 rounded-xl"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}

export default function SellerDiscountCodes() {
  const { employee } = useUserRole();
  const { data: codes, isLoading } = useSellerDiscountCodes(employee?.id);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const totals = useMemo(() => {
    if (!codes) return { uses: 0, commission: 0, activeCount: 0 };
    return codes.reduce(
      (acc, c) => ({
        uses: acc.uses + c.times_used,
        commission: acc.commission + c.times_used * c.commission_cents,
        activeCount: acc.activeCount + (c.active ? 1 : 0),
      }),
      { uses: 0, commission: 0, activeCount: 0 }
    );
  }, [codes]);

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-border rounded w-48" />
        <div className="h-32 bg-surface rounded-2xl" />
        <div className="h-64 bg-surface rounded-2xl" />
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Ticket className="w-5 h-5 text-accent" />
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Alennuskoodit</h1>
      </div>

      <div className="bg-surface rounded-2xl border border-border p-5 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-violet-50">
              <Euro className="w-5 h-5 text-violet-600" />
            </div>
            <div>
              <p className="text-xs font-medium text-text-muted">Provisiot yhteensä</p>
              <p className="text-2xl font-bold text-text-primary tabular-nums">
                {formatCents(totals.commission)}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs text-text-muted">Käyttöjä yhteensä</p>
            <p className="text-lg font-bold text-text-primary tabular-nums">{totals.uses}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <div className="bg-surface rounded-xl border border-border px-4 py-3">
          <p className="text-xs font-medium text-text-muted mb-1">Aktiiviset koodit</p>
          <p className="text-lg font-bold text-text-primary tabular-nums">{totals.activeCount}</p>
        </div>
        <div className="bg-surface rounded-xl border border-border px-4 py-3">
          <p className="text-xs font-medium text-text-muted mb-1">Koodeja yhteensä</p>
          <p className="text-lg font-bold text-text-primary tabular-nums">{codes?.length ?? 0}</p>
        </div>
      </div>

      <div className="space-y-3">
        {!codes || codes.length === 0 ? (
          <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">
            Sinulle ei ole vielä allokoitu alennuskoodeja.
          </div>
        ) : (
          codes.map((dc) => {
            const earned = dc.times_used * dc.commission_cents;
            const isExpanded = expandedId === dc.id;
            return (
              <div key={dc.id} className="bg-surface rounded-2xl border border-border overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedId(isExpanded ? null : dc.id)}
                  className="w-full text-left p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 hover:bg-surface-hover transition-colors"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-accent-muted flex items-center justify-center flex-shrink-0">
                      <Ticket className="w-5 h-5 text-accent-dark" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-bold text-sm text-text-primary font-mono uppercase">{dc.code}</span>
                        <Badge className={dc.active ? "bg-accent-muted text-accent-dark border border-accent/30" : "bg-gray-100 text-gray-500 border border-gray-200"}>
                          {dc.active ? "Aktiivinen" : "Ei aktiivinen"}
                        </Badge>
                        {dc.expires_at && new Date(dc.expires_at) < new Date() && (
                          <Badge className="bg-red-50 text-red-600 border border-red-200">Vanhentunut</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-xs text-text-secondary">
                        <span>Alennus: <span className="font-semibold">{formatDiscount(dc)}</span></span>
                        <span>Käyttöjä: <span className="font-semibold">{dc.times_used}</span>{dc.max_uses != null ? ` / ${dc.max_uses}` : ""}</span>
                        {dc.commission_cents > 0 && (
                          <span>Provisio: {formatCents(dc.commission_cents)} / käyttö</span>
                        )}
                        {dc.expires_at && <span>Vanhenee: {dc.expires_at.slice(0, 10)}</span>}
                      </div>
                      <p className="text-[10px] text-text-muted mt-1">Luotu {formatDateTime(dc.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0 sm:ml-4">
                    <div className="text-right">
                      <p className="text-[10px] text-text-muted">Ansaittu</p>
                      <p className="text-base font-bold text-text-primary tabular-nums">{formatCents(earned)}</p>
                    </div>
                    {dc.times_used > 0 ? (
                      isExpanded ? <ChevronDown className="w-4 h-4 text-text-muted" /> : <ChevronRight className="w-4 h-4 text-text-muted" />
                    ) : (
                      <div className="w-4" />
                    )}
                  </div>
                </button>

                {isExpanded && dc.times_used > 0 && (
                  <div className="border-t border-border px-5 pb-4">
                    <p className="text-xs font-semibold text-text-muted uppercase tracking-wide mt-4 mb-2">Käyttöhistoria</p>
                    <CodeUsageHistory codeId={dc.id} />
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
