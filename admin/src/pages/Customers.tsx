import { useState } from "react";
import { Link } from "react-router-dom";
import { useCustomers } from "@/hooks/useCustomers";
import { Search, Users } from "lucide-react";
import { formatDateTime } from "@/lib/utils";

export default function Customers() {
  const [search, setSearch] = useState("");
  const { data: customers, isLoading } = useCustomers(search || undefined);

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Users className="w-5 h-5 text-accent" />
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Asiakkaat</h1>
        {customers && <span className="text-sm text-text-muted">({customers.length})</span>}
      </div>

      <div className="relative max-w-sm mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
        <input
          type="text"
          placeholder="Hae nimellä, sähköpostilla, puhelimella..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
        />
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <p className="p-8 text-center text-text-muted">Ladataan...</p>
        ) : customers?.length === 0 ? (
          <p className="p-8 text-center text-text-muted">Ei asiakkaita</p>
        ) : (
          customers?.map((c) => (
            <Link key={c.id} to={`/asiakkaat/${c.id}`}
              className="block bg-surface rounded-2xl border border-border p-4 hover:bg-surface-hover transition-colors">
              <p className="font-medium text-sm text-text-primary">{c.first_name} {c.last_name}</p>
              <p className="text-sm text-text-secondary mt-1">{c.email}</p>
              <p className="text-sm text-text-secondary mt-0.5">{c.phone || "-"}</p>
            </Link>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-surface rounded-2xl border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border bg-surface-alt">
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Nimi</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Sähköposti</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Puhelin</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Postinumero</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Luotu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={5} className="p-8 text-center text-text-muted">Ladataan...</td></tr>
            ) : customers?.length === 0 ? (
              <tr><td colSpan={5} className="p-8 text-center text-text-muted">Ei asiakkaita</td></tr>
            ) : (
              customers?.map((c) => (
                <tr key={c.id} className="hover:bg-surface-hover transition-colors">
                  <td className="px-6 py-4">
                    <Link to={`/asiakkaat/${c.id}`} className="font-medium text-sm text-text-primary hover:text-accent-dark transition-colors">
                      {c.first_name} {c.last_name}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{c.email}</td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{c.phone || "-"}</td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{c.postal_code || "-"}</td>
                  <td className="px-6 py-4 text-sm text-text-muted">{formatDateTime(c.created_at)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
