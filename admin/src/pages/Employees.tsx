import { useState } from "react";
import { Link } from "react-router-dom";
import { useEmployees, useCreateEmployee, useUpdateEmployee } from "@/hooks/useEmployees";
import { Badge } from "@/components/ui/badge";
import { Search, Plus, UserCheck, UserX, HardHat, Eye } from "lucide-react";
import { formatDateTime } from "@/lib/utils";
import { TIER_LABELS, ROLE_LABELS, ROLE_STYLES } from "@/lib/constants";
import type { Employee, EmployeeRole, InstallerTier } from "@/lib/types";
import { startImpersonation } from "@/lib/impersonation";
import { useConfirm } from "@/context/ConfirmContext";
import { useUserRole } from "@/context/UserRoleContext";
import { useToast } from "@/context/ToastContext";

function primaryRole(roles: EmployeeRole[]): EmployeeRole {
  if (roles.includes("admin")) return "admin";
  if (roles.includes("seller")) return "seller";
  return "installer";
}

function hasAdmin(roles: EmployeeRole[]): boolean {
  return roles?.includes("admin") ?? false;
}

export default function Employees() {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<EmployeeRole | undefined>();
  const { data: employees, isLoading } = useEmployees(roleFilter);
  const createEmployee = useCreateEmployee();
  const updateEmployee = useUpdateEmployee();
  const confirm = useConfirm();
  const toast = useToast();
  const { employee: adminEmployee } = useUserRole();
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [showBlocked, setShowBlocked] = useState(false);

  async function handleImpersonate(emp: Employee) {
    if (!emp.user_id) {
      toast.error("Työntekijällä ei ole kirjautumistunnuksia");
      return;
    }
    const ok = await confirm({
      title: "Imitoi työntekijää",
      message: `Kirjaudut sisään käyttäjänä ${emp.first_name} ${emp.last_name} ja näet sekä toimit täsmälleen kuten he. Toiminta kirjataan lokiin. Pääset takaisin yläpalkin "Palaa adminiksi" -painikkeesta.`,
      confirmLabel: "Imitoi",
    });
    if (!ok) return;
    setImpersonatingId(emp.id);
    try {
      const adminName = adminEmployee
        ? `${adminEmployee.first_name} ${adminEmployee.last_name}`.trim()
        : "Admin";
      await startImpersonation(emp.id, adminName);
      // startImpersonation navigates away on success
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Imitointi epäonnistui");
      setImpersonatingId(null);
    }
  }

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", phone: "", postal_code: "",
    role: "installer" as EmployeeRole, tier: "yrittaja" as InstallerTier, salary_cents: "", password: "",
  });
  const [formError, setFormError] = useState("");

  const blockedCount = employees?.filter((e) => e.active === false).length ?? 0;

  const filtered = employees?.filter((e) => {
    // Blocked employees are hidden from the default view unless explicitly shown
    if (!showBlocked && e.active === false) return false;
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      e.first_name.toLowerCase().includes(q) ||
      e.last_name.toLowerCase().includes(q) ||
      e.email.toLowerCase().includes(q)
    );
  });

  async function handleCreate(ev: React.FormEvent) {
    ev.preventDefault();
    setFormError("");
    try {
      await createEmployee.mutateAsync({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone || undefined,
        postal_code: form.postal_code || undefined,
        roles: [form.role],
        tier: form.role === "installer" ? form.tier : undefined,
        salary_cents: form.tier === "palkallinen" && form.salary_cents ? Math.round(parseFloat(form.salary_cents) * 100) : undefined,
        password: form.password || undefined,
      });
      setShowForm(false);
      setForm({ first_name: "", last_name: "", email: "", phone: "", postal_code: "", role: "installer", tier: "yrittaja", salary_cents: "", password: "" });
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Luonti epäonnistui");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <HardHat className="w-5 h-5 text-accent" />
          <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Työntekijät</h1>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 px-3 py-2 sm:px-5 sm:py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">Lisää työntekijä</span>
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-surface rounded-2xl border border-border p-6 mb-6 space-y-5">
          {formError && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{formError}</div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Etunimi *</label>
              <input type="text" required value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Sukunimi *</label>
              <input type="text" required value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Rooli</label>
              <select value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value as EmployeeRole })}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent">
                <option value="installer">Asentaja</option>
                <option value="seller">Myyjä</option>
              </select>
            </div>
          </div>
          {form.role === "installer" && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Tier *</label>
                <select value={form.tier}
                  onChange={(e) => setForm({ ...form, tier: e.target.value as InstallerTier })}
                  className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent">
                  <option value="yrittaja">Yrittäjä</option>
                  <option value="alihankkija">Alihankkija</option>
                  <option value="palkallinen">Palkallinen</option>
                </select>
              </div>
              {form.tier === "palkallinen" && (
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Kuukausipalkka (€)</label>
                  <input type="number" min={0} step={0.01} value={form.salary_cents}
                    onChange={(e) => setForm({ ...form, salary_cents: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
                </div>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Sähköposti *</label>
              <input type="email" required value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Puhelin</label>
              <input type="tel" value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Postinumero</label>
              <input type="text" value={form.postal_code}
                onChange={(e) => setForm({ ...form, postal_code: e.target.value })}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
            </div>
          </div>
          <div className="max-w-sm">
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
              Salasana <span className="normal-case font-normal">(luo kirjautumistunnukset)</span>
            </label>
            <input type="password" value={form.password} minLength={8}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="Jätä tyhjäksi jos ei vielä tarvita"
              className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
          </div>
          <div className="flex gap-3">
            <button type="submit" disabled={createEmployee.isPending}
              className="px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
              {createEmployee.isPending ? "Luodaan..." : "Luo työntekijä"}
            </button>
            <button type="button" onClick={() => setShowForm(false)}
              className="px-5 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors">
              Peruuta
            </button>
          </div>
        </form>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex gap-1 bg-surface rounded-xl p-1 border border-border">
          {([undefined, "installer", "seller"] as const).map((r) => (
            <button key={r ?? "all"} onClick={() => setRoleFilter(r)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                roleFilter === r ? "bg-brand text-white shadow-sm" : "text-text-secondary hover:text-text-primary"
              }`}>
              {r === undefined ? "Kaikki" : r === "installer" ? "Asentajat" : "Myyjät"}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
          <input type="text" placeholder="Hae nimellä tai sähköpostilla..."
            value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all" />
        </div>
        {blockedCount > 0 && (
          <button
            type="button"
            onClick={() => setShowBlocked((v) => !v)}
            className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors whitespace-nowrap ${
              showBlocked
                ? "bg-red-50 text-red-700 border-red-200"
                : "bg-surface text-text-secondary border-border hover:text-text-primary"
            }`}
          >
            <UserX className="w-4 h-4" />
            {showBlocked ? "Piilota estetyt" : `Näytä estetyt (${blockedCount})`}
          </button>
        )}
      </div>

      {/* Mobile card view */}
      <div className="md:hidden space-y-3">
        {isLoading ? (
          <p className="p-8 text-center text-text-muted">Ladataan...</p>
        ) : !filtered || filtered.length === 0 ? (
          <p className="p-8 text-center text-text-muted">Ei työntekijöitä</p>
        ) : (
          filtered.map((emp) => (
            <div key={emp.id} className={`bg-surface rounded-2xl border border-border p-4 ${emp.active === false ? "opacity-60" : ""}`}>
              <Link to={`/tyontekijat/${emp.id}`} className="block hover:opacity-80 transition-opacity">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-sm text-text-primary">{emp.first_name} {emp.last_name}</p>
                  {emp.active ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-accent-dark">
                      <UserCheck className="w-3.5 h-3.5" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                      <UserX className="w-3.5 h-3.5" /> Estetty
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-2">
                  <Badge className={ROLE_STYLES[primaryRole(emp.roles)]}>
                    {ROLE_LABELS[primaryRole(emp.roles)]}
                  </Badge>
                  {emp.tier && (
                    <Badge className="bg-surface-alt text-text-secondary border border-border">
                      {TIER_LABELS[emp.tier]}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-text-secondary mt-2">{emp.email}</p>
                <p className="text-sm text-text-secondary mt-0.5">{emp.phone || "-"}</p>
              </Link>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-border">
                <span className="text-xs font-medium text-text-muted">Admin-oikeudet</span>
                <button
                  type="button"
                  onClick={() => {
                    const isAdmin = hasAdmin(emp.roles);
                    const newRoles = isAdmin
                      ? emp.roles.filter((r): r is EmployeeRole => r !== "admin")
                      : [...emp.roles, "admin" as EmployeeRole];
                    updateEmployee.mutate({ id: emp.id, roles: newRoles.length ? newRoles : ["installer"] });
                  }}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    hasAdmin(emp.roles) ? "bg-accent" : "bg-border"
                  }`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    hasAdmin(emp.roles) ? "translate-x-6" : "translate-x-1"
                  }`} />
                </button>
              </div>
              {emp.user_id && !hasAdmin(emp.roles) && (
                <button
                  type="button"
                  onClick={() => handleImpersonate(emp)}
                  disabled={impersonatingId === emp.id}
                  className="mt-3 w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-border rounded-xl text-xs font-semibold text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
                >
                  <Eye className="w-3.5 h-3.5" />
                  {impersonatingId === emp.id ? "Kirjaudutaan…" : "Imitoi"}
                </button>
              )}
            </div>
          ))
        )}
      </div>

      {/* Desktop table */}
      <div className="hidden md:block bg-surface rounded-2xl border border-border overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[800px]">
          <thead>
            <tr className="border-b border-border bg-surface-alt">
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Nimi</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Rooli</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Sähköposti</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Puhelin</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Admin</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Tila</th>
              <th className="text-left px-6 py-3.5 text-xs font-semibold text-text-muted uppercase tracking-wider">Luotu</th>
              <th className="text-right px-6 py-3.5 text-xs font-semibold text-text-muted uppercase tracking-wider"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? (
              <tr><td colSpan={8} className="p-8 text-center text-text-muted">Ladataan...</td></tr>
            ) : !filtered || filtered.length === 0 ? (
              <tr><td colSpan={8} className="p-8 text-center text-text-muted">Ei työntekijöitä</td></tr>
            ) : (
              filtered.map((emp) => (
                <tr key={emp.id} className={`hover:bg-surface-hover transition-colors ${emp.active === false ? "opacity-55" : ""}`}>
                  <td className="px-6 py-4">
                    <Link to={`/tyontekijat/${emp.id}`} className="font-medium text-sm text-text-primary hover:text-accent-dark transition-colors">
                      {emp.first_name} {emp.last_name}
                    </Link>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <Badge className={ROLE_STYLES[primaryRole(emp.roles)]}>
                        {ROLE_LABELS[primaryRole(emp.roles)]}
                      </Badge>
                      {emp.tier && (
                        <Badge className="bg-surface-alt text-text-secondary border border-border">
                          {TIER_LABELS[emp.tier]}
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{emp.email}</td>
                  <td className="px-6 py-4 text-sm text-text-secondary">{emp.phone || "-"}</td>
                  <td className="px-6 py-4">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        const isAdmin = hasAdmin(emp.roles);
                        const newRoles = isAdmin
                          ? emp.roles.filter((r): r is EmployeeRole => r !== "admin")
                          : [...emp.roles, "admin" as EmployeeRole];
                        updateEmployee.mutate({ id: emp.id, roles: newRoles.length ? newRoles : ["installer"] });
                      }}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        hasAdmin(emp.roles) ? "bg-accent" : "bg-border"
                      }`}
                    >
                      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                        hasAdmin(emp.roles) ? "translate-x-6" : "translate-x-1"
                      }`} />
                    </button>
                  </td>
                  <td className="px-6 py-4">
                    {emp.active ? (
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-accent-dark">
                        <UserCheck className="w-3.5 h-3.5" /> Aktiivinen
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600">
                        <UserX className="w-3.5 h-3.5" /> Estetty
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-sm text-text-muted">{formatDateTime(emp.created_at)}</td>
                  <td className="px-6 py-4 text-right">
                    {emp.user_id && !hasAdmin(emp.roles) && (
                      <button
                        type="button"
                        onClick={() => handleImpersonate(emp)}
                        disabled={impersonatingId === emp.id}
                        title="Kirjaudu sisään tänä työntekijänä"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-border rounded-lg text-xs font-semibold text-text-secondary hover:bg-surface-hover hover:text-text-primary transition-colors disabled:opacity-50"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        {impersonatingId === emp.id ? "Kirjaudutaan…" : "Imitoi"}
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
