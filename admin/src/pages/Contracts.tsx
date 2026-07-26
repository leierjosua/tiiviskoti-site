import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Plus, Search, FileSignature } from "lucide-react";
import { useContracts } from "@/hooks/useContracts";
import { Badge } from "@/components/ui/badge";
import {
  formatCents,
  formatDate,
  CONTRACT_STATUS_LABELS,
  CONTRACT_STATUS_COLORS,
} from "@/lib/utils";
import type { ContractStatus } from "@/lib/types";

const tabs: { label: string; value: ContractStatus | "all" }[] = [
  { label: "Kaikki", value: "all" },
  { label: "Aktiiviset", value: "active" },
  { label: "Odottaa", value: "pending_signature" },
  { label: "Luonnokset", value: "draft" },
  { label: "Päättyneet", value: "expired" },
  { label: "Peruutetut", value: "cancelled" },
];

export default function Contracts() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<ContractStatus | "all">("all");
  const [search, setSearch] = useState("");

  const { data: contracts, isLoading } = useContracts({
    status: tab === "all" ? undefined : tab,
    search: search || undefined,
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2">
          <FileSignature className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Sopimukset</h1>
        </div>
        <div className="flex gap-2">
          <Link
            to="/sopimukset/mallit"
            className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-border text-text-secondary hover:bg-surface-hover transition-colors whitespace-nowrap"
          >
            Mallit
          </Link>
          <Link
            to="/sopimukset/uusi"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-light transition-colors whitespace-nowrap"
          >
            <Plus className="w-4 h-4" />
            Luo sopimus
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto mb-4 pb-1">
        {tabs.map((t) => (
          <button
            key={t.value}
            onClick={() => setTab(t.value)}
            className={`px-3.5 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              tab === t.value
                ? "bg-brand text-white"
                : "text-text-muted hover:text-text-primary hover:bg-surface-hover"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Hae asiakkaan nimellä tai sähköpostilla..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full sm:max-w-sm pl-10 pr-4 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
        />
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-surface rounded-2xl" />
          ))}
        </div>
      ) : !contracts || contracts.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border p-12 text-center">
          <FileSignature className="w-12 h-12 text-text-muted mx-auto mb-3" />
          <p className="text-text-muted">Ei sopimuksia</p>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-surface rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-5 py-3 font-semibold text-text-muted text-xs uppercase tracking-wide">#</th>
                  <th className="px-5 py-3 font-semibold text-text-muted text-xs uppercase tracking-wide">Asiakas</th>
                  <th className="px-5 py-3 font-semibold text-text-muted text-xs uppercase tracking-wide">Sopimus</th>
                  <th className="px-5 py-3 font-semibold text-text-muted text-xs uppercase tracking-wide">Myyjä</th>
                  <th className="px-5 py-3 font-semibold text-text-muted text-xs uppercase tracking-wide">Alkaa</th>
                  <th className="px-5 py-3 font-semibold text-text-muted text-xs uppercase tracking-wide">Päättyy</th>
                  <th className="px-5 py-3 font-semibold text-text-muted text-xs uppercase tracking-wide">Tila</th>
                  <th className="px-5 py-3 font-semibold text-text-muted text-xs uppercase tracking-wide text-right">Hinta</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contracts.map((c) => {
                  const cust = c.customers;
                  const custName = cust ? `${cust.first_name} ${cust.last_name}` : "–";
                  return (
                    <tr key={c.id} onClick={() => navigate(`/sopimukset/${c.contract_number}`)} className="hover:bg-surface-hover transition-colors cursor-pointer">
                      <td className="px-5 py-3 font-medium text-accent-dark">
                        {c.contract_number}
                      </td>
                      <td className="px-5 py-3 font-medium text-text-primary">{custName}</td>
                      <td className="px-5 py-3 text-text-secondary">{c.contract_templates?.name || "–"}</td>
                      <td className="px-5 py-3 text-text-secondary">{c.employees ? `${c.employees.first_name} ${c.employees.last_name}` : "–"}</td>
                      <td className="px-5 py-3 text-text-secondary">{formatDate(c.start_date)}</td>
                      <td className="px-5 py-3 text-text-secondary">{formatDate(c.end_date)}</td>
                      <td className="px-5 py-3">
                        <Badge className={CONTRACT_STATUS_COLORS[c.status]}>
                          {CONTRACT_STATUS_LABELS[c.status]}
                        </Badge>
                      </td>
                      <td className="px-5 py-3 text-right font-bold text-text-primary">{formatCents(c.contract_price_cents)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-3">
            {contracts.map((c) => {
              const cust = c.customers;
              const custName = cust ? `${cust.first_name} ${cust.last_name}` : "–";
              return (
                <Link
                  key={c.id}
                  to={`/sopimukset/${c.contract_number}`}
                  className="block bg-surface rounded-2xl border border-border p-4 hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="font-semibold text-text-primary">{custName}</p>
                      <p className="text-xs text-text-muted">#{c.contract_number} · {c.contract_templates?.name || "–"}</p>
                    </div>
                    <Badge className={CONTRACT_STATUS_COLORS[c.status]}>
                      {CONTRACT_STATUS_LABELS[c.status]}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-text-secondary">
                      {formatDate(c.start_date)} — {formatDate(c.end_date)}
                    </span>
                    <span className="font-bold text-text-primary">{formatCents(c.contract_price_cents)}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
