import { useState, useMemo, lazy, Suspense } from "react";

const ServiceAreaMap = lazy(() => import("@/components/ServiceAreaMap"));
import { useParams, Link, useNavigate } from "react-router-dom";
import { useConfirm } from "@/context/ConfirmContext";
import {
  useEmployee,
  useEmployeeServices,
  useSetEmployeeServices,
  useInstallerCalendars,
  useCreateCalendar,
  useUpdateCalendar,
  useDeleteCalendar,
  useWeeklySlots,
  useSetWeeklySlots,
  useCalendarOverrides,
  useCreateOverride,
  useDeleteOverride,
  useDeleteEmployee,
  useSetServicePriority,
} from "@/hooks/useEmployees";
import { useUpdateEmployee } from "@/hooks/useEmployees";
import { useServices, useServiceAreas, useCreateServiceArea, useUpdateServiceArea, useDeleteServiceArea } from "@/hooks/useServices";
import { Badge } from "@/components/ui/badge";
import { TimePicker } from "@/components/ui/TimePicker";
import { ArrowLeft, Plus, Trash2, Calendar, MapPin, Pencil, ChevronLeft, ChevronRight, ChevronDown, X, Save, Eye, EyeOff, PartyPopper, Ban, ShieldCheck } from "lucide-react";
import { PostalCodePicker } from "@/components/PostalCodePicker";
import { postalCodesWithinRadius } from "@/lib/postal-distances";
import { supabase, getFreshToken } from "@/lib/supabase";
import { formatDate, formatCents, postalCodesToCities, MONTH_NAMES_FI } from "@/lib/utils";
import { TIER_LABELS, ROLE_LABELS, ROLE_STYLES } from "@/lib/constants";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import { useAddonServices, useAllAddonServiceLinks, useEmployeeAddonExclusions, useSetAddonExclusions } from "@/hooks/useAddonServices";
import {
  usePalkallinenDefaults,
  usePalkallinenOverrides,
  savePalkallinenInternalCost,
  useInvalidatePalkallinenCosts,
} from "@/hooks/usePalkallinenInternalCosts";
import type { EmployeeRole, InstallerTier, CalendarOverride, InstallerCalendar, EmployeeCommission, Service, ServiceArea, PalkallinenInternalCost } from "@/lib/types";

function primaryRole(roles: EmployeeRole[]): EmployeeRole {
  if (roles?.includes("admin")) return "admin";
  if (roles?.includes("seller")) return "seller";
  return "installer";
}


export default function EmployeeDetail() {
  const confirm = useConfirm();
  const { id } = useParams<{ id: string }>();
  const { data: employee, isLoading } = useEmployee(id);
  const { data: empServices } = useEmployeeServices(id);
  const { data: calendars } = useInstallerCalendars(id);
  const { data: allServices } = useServices();
  const { data: serviceAreas } = useServiceAreas(id);
  const updateEmployee = useUpdateEmployee();
  const createServiceArea = useCreateServiceArea();
  const updateServiceArea = useUpdateServiceArea();
  const deleteServiceArea = useDeleteServiceArea();
  const setEmpServices = useSetEmployeeServices();
  const createCalendar = useCreateCalendar();
  const updateCalendar = useUpdateCalendar();
  const deleteCalendar = useDeleteCalendar();
  const deleteEmployee = useDeleteEmployee();
  const setServicePriority = useSetServicePriority();
  const navigate = useNavigate();

  const [selectedCalendar, setSelectedCalendar] = useState<InstallerCalendar | null>(null);
  const [showCalendarForm, setShowCalendarForm] = useState(false);
  const [calForm, setCalForm] = useState({ service_ids: [] as string[], service_area_ids: [] as string[], name: "" });
  const [showAreaForm, setShowAreaForm] = useState(false);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [areaForm, setAreaForm] = useState({ name: "", description: "", postal_codes: [] as string[], mode: "manual" as "manual" | "radius", center_postal: "", radius_km: "" });
  const [areaError, setAreaError] = useState("");
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({ first_name: "", last_name: "", email: "", phone: "", postal_code: "", tukes_number: "" });
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [blockSaving, setBlockSaving] = useState(false);

  // Addon exclusions
  const { data: addonLinks } = useAllAddonServiceLinks();
  const { data: addonExclusions } = useEmployeeAddonExclusions(id);
  const setAddonExclusions = useSetAddonExclusions();

  // Employee commissions
  const queryClient = useQueryClient();
  const { data: allAddons } = useAddonServices();
  const { data: palkallinenDefaults } = usePalkallinenDefaults();
  const { data: palkallinenOverrides } = usePalkallinenOverrides(id);
  const invalidatePalkallinen = useInvalidatePalkallinenCosts();
  const { data: employeeCommissions } = useQuery({
    queryKey: queryKeys.employeeCommissions.byEmployee(id),
    queryFn: async () => {
      if (!id) return [];
      const { data, error } = await supabase
        .from("employee_commissions")
        .select("*")
        .eq("employee_id", id);
      if (error) throw error;
      return data as EmployeeCommission[];
    },
    enabled: !!id,
  });

  const assignedServiceIds = empServices?.map((es: { service_id: string }) => es.service_id) || [];

  const relevantAddons = useMemo(() => {
    if (!allAddons || !addonLinks) return [];
    const assignedSet = new Set(assignedServiceIds);
    const linkedAddonIds = new Set(
      addonLinks.filter((l) => assignedSet.has(l.service_id)).map((l) => l.addon_service_id)
    );
    return allAddons.filter((a) => a.active && linkedAddonIds.has(a.id));
  }, [allAddons, addonLinks, assignedServiceIds]);

  if (isLoading) {
    return <div className="animate-pulse space-y-4">
      <div className="h-6 bg-border rounded w-32" />
      <div className="h-64 bg-surface rounded-2xl" />
    </div>;
  }

  if (!employee) return <p className="text-text-muted">Työntekijää ei löytynyt</p>;

  function toggleAddonExclusion(addonId: string) {
    if (!addonExclusions) return;
    const current = [...addonExclusions];
    const isExcluded = addonExclusions.has(addonId);
    const next = isExcluded
      ? current.filter((id) => id !== addonId)
      : [...current, addonId];
    setAddonExclusions.mutate({ employeeId: employee!.id, excludedAddonIds: next });
  }

  function toggleService(serviceId: string) {
    const current = assignedServiceIds;
    const next = current.includes(serviceId)
      ? current.filter((id: string) => id !== serviceId)
      : [...current, serviceId];
    setEmpServices.mutate({ employeeId: employee!.id, serviceIds: next });
  }

  async function handleToggleBlock() {
    if (!employee) return;
    const blocking = employee.active !== false;
    const ok = await confirm({
      title: blocking ? "Estä pääsy järjestelmään" : "Poista esto",
      message: blocking
        ? `Haluatko varmasti estää käyttäjän ${employee.first_name} ${employee.last_name} pääsyn? Kirjautuminen estyy heti ja mahdollinen aktiivinen istunto katkaistaan. Tietoja tai historiaa ei poisteta ja eston voi peruuttaa myöhemmin.`
        : `Palautetaanko käyttäjän ${employee.first_name} ${employee.last_name} pääsy järjestelmään?`,
      confirmLabel: blocking ? "Estä pääsy" : "Poista esto",
      variant: blocking ? "danger" : undefined,
    });
    if (!ok) return;
    setBlockSaving(true);
    try {
      // Ban/unban the auth account first (the real lock). Skip if no login exists.
      if (employee.user_id) {
        const { error } = await supabase.functions.invoke("create-admin-user", {
          body: { userId: employee.user_id, action: "set-active", active: !blocking },
        });
        if (error) throw error;
      }
      await updateEmployee.mutateAsync({ id: employee.id, active: !blocking });
    } catch (err) {
      alert(err instanceof Error ? err.message : "Toiminto epäonnistui");
    } finally {
      setBlockSaving(false);
    }
  }

  async function handleCreateCalendar(ev: React.FormEvent) {
    ev.preventDefault();
    const created = await createCalendar.mutateAsync({
      employee_id: employee!.id,
      service_ids: calForm.service_ids,
      service_area_ids: calForm.service_area_ids,
      name: calForm.name,
    });
    setShowCalendarForm(false);
    setCalForm({ service_ids: [], service_area_ids: [], name: "" });
    // Auto-select new calendar so schedule editor opens immediately
    setSelectedCalendar(created);
  }

  return (
    <div className="overflow-hidden">
      <Link to="/tyontekijat" className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> Takaisin
      </Link>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 bg-accent-muted rounded-xl flex items-center justify-center text-accent-dark font-bold text-base sm:text-lg flex-shrink-0">
            {employee.first_name[0]}{employee.last_name[0]}
          </div>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary truncate">{employee.first_name} {employee.last_name}</h1>
            <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-0.5">
              <Badge className={ROLE_STYLES[primaryRole(employee.roles)]}>
                {ROLE_LABELS[primaryRole(employee.roles)]}
              </Badge>
              {employee.active === false && (
                <Badge className="bg-red-50 text-red-700 border border-red-200 inline-flex items-center gap-1">
                  <Ban className="w-3 h-3" /> Estetty
                </Badge>
              )}
              {employee.tier && (
                <Badge className="bg-surface-alt text-text-secondary border border-border">
                  {TIER_LABELS[employee.tier]}
                </Badge>
              )}
              <span className="text-sm text-text-muted break-all">{employee.email}</span>
              {employee.phone && <span className="text-sm text-text-muted">{employee.phone}</span>}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            const ok = await confirm({
              title: "Poista työntekijä",
              message: `Haluatko varmasti poistaa työntekijän ${employee.first_name} ${employee.last_name}? Tämä poistaa myös kaikki kalenterit, palvelualueet ja mahdollisen käyttäjätilin. Toimintoa ei voi perua.`,
              confirmLabel: "Poista",
              variant: "danger",
            });
            if (!ok) return;
            try {
              await deleteEmployee.mutateAsync({ id: employee.id, userId: employee.user_id });
              navigate("/tyontekijat");
            } catch (err) {
              alert(err instanceof Error ? err.message : "Poistaminen epäonnistui");
            }
          }}
          disabled={deleteEmployee.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-colors disabled:opacity-50 flex-shrink-0 self-start sm:self-auto"
        >
          <Trash2 className="w-4 h-4" />
          <span className="hidden sm:inline">Poista</span>
        </button>
      </div>

      <div className="space-y-6">
        {/* Basic Info */}
        <div className="bg-surface rounded-2xl border border-border p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-text-primary">Perustiedot</h2>
            {!editingInfo && (
              <button
                onClick={() => {
                  setInfoForm({
                    first_name: employee.first_name,
                    last_name: employee.last_name,
                    email: employee.email,
                    phone: employee.phone || "",
                    postal_code: employee.postal_code || "",
                    tukes_number: employee.tukes_number || "",
                  });
                  setEditingInfo(true);
                }}
                className="inline-flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
              >
                <Pencil className="w-3.5 h-3.5" /> Muokkaa
              </button>
            )}
          </div>

          {!editingInfo ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <span className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Nimi</span>
                <span className="text-sm text-text-primary">{employee.first_name} {employee.last_name}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Sähköposti</span>
                <span className="text-sm text-text-primary break-all">{employee.email}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Puhelin</span>
                <span className="text-sm text-text-primary">{employee.phone || "–"}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Postinumero</span>
                <span className="text-sm text-text-primary">{employee.postal_code || "–"}</span>
              </div>
              <div>
                <span className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Tukes-numero</span>
                <span className="text-sm text-text-primary">{employee.tukes_number || "–"}</span>
              </div>
              {employee.user_id && (
                <div className="sm:col-span-2">
                  <span className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-1">Kirjautuminen</span>
                  <span className="text-sm text-accent-dark">Käyttäjätili aktiivinen</span>
                </div>
              )}
            </div>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const newEmail = infoForm.email.trim();
                // If email changed and employee has a login, update auth email too
                if (employee.user_id && newEmail !== employee.email) {
                  const token = await getFreshToken();
                  const fnRes = await fetch(
                    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-admin-user`,
                    {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`,
                        "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY,
                      },
                      body: JSON.stringify({ userId: employee.user_id, email: newEmail, action: "update-email" }),
                    }
                  );
                  if (!fnRes.ok) {
                    const fnJson = await fnRes.json().catch(() => ({}));
                    alert(fnJson.error || "Sähköpostin päivitys epäonnistui");
                    return;
                  }
                }
                updateEmployee.mutate(
                  {
                    id: employee.id,
                    first_name: infoForm.first_name.trim(),
                    last_name: infoForm.last_name.trim(),
                    email: newEmail,
                    phone: infoForm.phone.trim() || null,
                    postal_code: infoForm.postal_code.trim() || null,
                    tukes_number: infoForm.tukes_number.trim() || null,
                  },
                  { onSuccess: () => setEditingInfo(false) }
                );
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Etunimi</label>
                  <input
                    type="text"
                    required
                    value={infoForm.first_name}
                    onChange={(e) => setInfoForm({ ...infoForm, first_name: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Sukunimi</label>
                  <input
                    type="text"
                    required
                    value={infoForm.last_name}
                    onChange={(e) => setInfoForm({ ...infoForm, last_name: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Sähköposti</label>
                  <input
                    type="email"
                    required
                    value={infoForm.email}
                    onChange={(e) => setInfoForm({ ...infoForm, email: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Puhelin</label>
                  <input
                    type="tel"
                    value={infoForm.phone}
                    onChange={(e) => setInfoForm({ ...infoForm, phone: e.target.value })}
                    placeholder="040 1234567"
                    className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Postinumero</label>
                  <input
                    type="text"
                    value={infoForm.postal_code}
                    onChange={(e) => setInfoForm({ ...infoForm, postal_code: e.target.value })}
                    placeholder="00100"
                    className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Tukes-numero</label>
                  <input
                    type="text"
                    value={infoForm.tukes_number}
                    onChange={(e) => setInfoForm({ ...infoForm, tukes_number: e.target.value })}
                    placeholder="Esim. 12345"
                    className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  />
                  <p className="text-xs text-text-muted mt-1">Näytetään asennuspöytäkirjoissa asentajan nimen yhteydessä.</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="submit"
                  disabled={updateEmployee.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent text-accent-dark text-sm font-semibold rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  <Save className="w-4 h-4" /> Tallenna
                </button>
                <button
                  type="button"
                  onClick={() => setEditingInfo(false)}
                  className="px-4 py-2.5 text-sm text-text-muted hover:text-text-primary border border-border rounded-xl transition-colors"
                >
                  Peruuta
                </button>
              </div>
            </form>
          )}

          {/* Password section */}
          {employee.user_id && (
            <div className="mt-6 pt-6 border-t border-border">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Vaihda salasana</h3>
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                <div className="w-full sm:max-w-xs">
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setPasswordMsg(null); }}
                      placeholder="Uusi salasana (vähintään 8 merkkiä)"
                      minLength={8}
                      className="w-full px-3.5 py-2.5 pr-10 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={passwordSaving || newPassword.length < 8}
                  onClick={async () => {
                    setPasswordSaving(true);
                    setPasswordMsg(null);
                    try {
                      const { error } = await supabase.functions.invoke("create-admin-user", {
                        body: { userId: employee.user_id, password: newPassword, action: "update-password" },
                      });
                      if (error) throw error;
                      setNewPassword("");
                      setPasswordMsg({ type: "success", text: "Salasana vaihdettu" });
                    } catch (err) {
                      setPasswordMsg({ type: "error", text: err instanceof Error ? err.message : "Virhe salasanan vaihdossa" });
                    } finally {
                      setPasswordSaving(false);
                    }
                  }}
                  className="whitespace-nowrap px-4 py-2.5 bg-surface-alt text-text-primary text-sm font-semibold rounded-xl border border-border hover:bg-border/50 transition-colors disabled:opacity-50"
                >
                  {passwordSaving ? "Tallennetaan..." : "Vaihda salasana"}
                </button>
              </div>
              {passwordMsg && (
                <p className={`text-xs mt-2 ${passwordMsg.type === "success" ? "text-accent-dark" : "text-red-600"}`}>
                  {passwordMsg.text}
                </p>
              )}
            </div>
          )}

          {/* Create login for employees without user_id */}
          {!employee.user_id && (
            <div className="mt-6 pt-6 border-t border-border">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Luo kirjautumistiedot</h3>
              <p className="text-xs text-text-muted mb-3">Työntekijällä ei ole vielä käyttäjätiliä. Luo salasana mahdollistaaksesi kirjautumisen.</p>
              <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-end">
                <div className="w-full sm:max-w-xs">
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={newPassword}
                      onChange={(e) => { setNewPassword(e.target.value); setPasswordMsg(null); }}
                      placeholder="Salasana (vähintään 8 merkkiä)"
                      minLength={8}
                      className="w-full px-3.5 py-2.5 pr-10 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-primary"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={passwordSaving || newPassword.length < 8}
                  onClick={async () => {
                    setPasswordSaving(true);
                    setPasswordMsg(null);
                    try {
                      const { data, error } = await supabase.functions.invoke("create-admin-user", {
                        body: { email: employee.email, password: newPassword },
                      });
                      if (error) throw error;
                      if (data?.userId) {
                        updateEmployee.mutate({ id: employee.id, user_id: data.userId });
                      }
                      setNewPassword("");
                      setPasswordMsg({ type: "success", text: "Käyttäjätili luotu" });
                    } catch (err) {
                      setPasswordMsg({ type: "error", text: err instanceof Error ? err.message : "Virhe tilin luomisessa" });
                    } finally {
                      setPasswordSaving(false);
                    }
                  }}
                  className="whitespace-nowrap px-4 py-2.5 bg-accent text-accent-dark text-sm font-semibold rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50"
                >
                  {passwordSaving ? "Luodaan..." : "Luo käyttäjätili"}
                </button>
              </div>
              {passwordMsg && (
                <p className={`text-xs mt-2 ${passwordMsg.type === "success" ? "text-accent-dark" : "text-red-600"}`}>
                  {passwordMsg.text}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Access / block */}
        <div className={`rounded-2xl border p-6 ${employee.active === false ? "bg-red-50/40 border-red-200" : "bg-surface border-border"}`}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${employee.active === false ? "bg-red-100 text-red-600" : "bg-accent-muted text-accent-dark"}`}>
                {employee.active === false ? <Ban className="w-4.5 h-4.5" /> : <ShieldCheck className="w-4.5 h-4.5" />}
              </div>
              <div>
                <h2 className="font-semibold text-text-primary">Pääsy järjestelmään</h2>
                <p className="text-xs text-text-muted mt-0.5 max-w-md">
                  {employee.active === false
                    ? "Pääsy on estetty. Henkilö ei voi kirjautua sisään eikä toimia järjestelmässä."
                    : "Estä pääsy katkaistaksesi kirjautumisen kokonaan. Tiedot ja historia säilyvät — eston voi peruuttaa milloin tahansa."}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleToggleBlock}
              disabled={blockSaving}
              className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold rounded-xl border transition-colors disabled:opacity-50 flex-shrink-0 ${
                employee.active === false
                  ? "bg-accent text-accent-dark border-transparent hover:bg-accent/90"
                  : "bg-red-600 text-white border-transparent hover:bg-red-700"
              }`}
            >
              {blockSaving ? "Tallennetaan…" : employee.active === false ? "Poista esto" : "Estä pääsy"}
            </button>
          </div>
        </div>

        {/* Roles */}
        <div className="bg-surface rounded-2xl border border-border p-6">
          <h2 className="font-semibold text-text-primary mb-4">Roolit</h2>
          <div className="flex flex-wrap gap-3">
            {(["installer", "seller", "admin"] as EmployeeRole[]).map((role) => {
              const isActive = employee.roles?.includes(role) ?? false;
              return (
                <button
                  key={role}
                  onClick={() => {
                    let newRoles: EmployeeRole[];
                    if (isActive) {
                      newRoles = (employee.roles || []).filter((r): r is EmployeeRole => r !== role);
                      if (newRoles.length === 0) return; // must have at least one role
                    } else {
                      newRoles = [...(employee.roles || []), role];
                    }
                    updateEmployee.mutate({ id: employee.id, roles: newRoles });
                  }}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-all ${
                    isActive
                      ? ROLE_STYLES[role]
                      : "bg-surface text-text-muted border-border hover:border-border-strong"
                  }`}
                >
                  {ROLE_LABELS[role]}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-text-muted mt-3">Klikkaa aktivoidaksesi tai poistaaksesi roolin. Vähintään yksi rooli vaaditaan.</p>
        </div>

        {/* Email notification preferences */}
        <div className="bg-surface rounded-2xl border border-border p-6">
          <h2 className="font-semibold text-text-primary mb-4">Sähköposti-ilmoitukset</h2>
          <div className="space-y-2">
            {([
              employee.roles?.includes("installer") && { key: "notify_new_job" as const, label: "Uusi varaus / työ minulle" },
              employee.roles?.includes("installer") && { key: "notify_rescheduled" as const, label: "Varauksen siirto" },
              employee.roles?.includes("installer") && { key: "notify_cancelled" as const, label: "Varauksen peruutus" },
              employee.roles?.includes("seller") && { key: "notify_new_lead" as const, label: "Uusi liidi minulle" },
            ].filter(Boolean) as Array<{ key: "notify_new_job" | "notify_rescheduled" | "notify_cancelled" | "notify_new_lead"; label: string }>).map(({ key, label }) => {
              const enabled = employee[key] !== false;
              return (
                <label key={key} className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border hover:border-border-strong transition-colors cursor-pointer">
                  <span className="text-sm text-text-primary">{label}</span>
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => updateEmployee.mutate({ id: employee.id, [key]: e.target.checked })}
                    className="h-5 w-5 rounded border-border text-accent focus:ring-accent/30"
                  />
                </label>
              );
            })}
          </div>
          <p className="text-xs text-text-muted mt-3">Pois päältä asetetut sähköpostit eivät lähetetä tälle henkilölle. Push-ilmoitukset eivät muutu.</p>
        </div>

        {/* Asentajan käyttöoikeudet */}
        {employee.roles?.includes("installer") && (
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-4">Asentajan käyttöoikeudet</h2>
            <div className="space-y-2">
              <label className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border hover:border-border-strong transition-colors cursor-pointer">
                <span className="text-sm text-text-primary">Näkee varauksen hinnat</span>
                <input
                  type="checkbox"
                  checked={employee.can_see_prices !== false}
                  onChange={(e) => updateEmployee.mutate({ id: employee.id, can_see_prices: e.target.checked })}
                  className="h-5 w-5 rounded border-border text-accent focus:ring-accent/30"
                />
              </label>
              <label className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl border border-border hover:border-border-strong transition-colors cursor-pointer">
                <span className="text-sm text-text-primary">Saa siirtää omia varauksiaan</span>
                <input
                  type="checkbox"
                  checked={employee.can_reschedule_own_bookings === true}
                  onChange={(e) => updateEmployee.mutate({ id: employee.id, can_reschedule_own_bookings: e.target.checked })}
                  className="h-5 w-5 rounded border-border text-accent focus:ring-accent/30"
                />
              </label>
            </div>
            <p className="text-xs text-text-muted mt-3">Kun pois päältä, asentaja näkee varauksen rivit (palvelut, tuotteet, lisäpalvelut) ilman hintoja. Provisio näkyy yrittäjille ja alihankkijoille tavalliseen tapaan.</p>
            <p className="text-xs text-text-muted mt-2">"Saa siirtää omia varauksiaan": asentaja voi siirtää keikkoja joissa hän on pääasentaja uuteen aikaan omassa kalenterissaan. Oletuksena pois päältä.</p>
          </div>
        )}

        {/* Tier & Salary (installers only) */}
        {employee.roles?.includes("installer") && (
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-4">Tier & palkka</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Tier</label>
                  <select
                    value={employee.tier || ""}
                    onChange={(e) => {
                      const tier = e.target.value as InstallerTier;
                      updateEmployee.mutate({ id: employee.id, tier, salary_cents: tier === "palkallinen" ? employee.salary_cents : 0 });
                    }}
                    className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                  >
                    <option value="">Ei valittu</option>
                    <option value="yrittaja">Yrittäjä</option>
                    <option value="alihankkija">Alihankkija</option>
                    <option value="palkallinen">Palkallinen</option>
                  </select>
                </div>
              {employee.tier === "palkallinen" && (
                <>
                  <div>
                    <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Tuntipalkka (€)</label>
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      defaultValue={(employee.hourly_rate_cents || 0) / 100}
                      onBlur={(e) => {
                        const val = Math.round(parseFloat(e.target.value || "0") * 100);
                        if (val !== (employee.hourly_rate_cents || 0)) {
                          updateEmployee.mutate({ id: employee.id, hourly_rate_cents: val });
                        }
                      }}
                      className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Sopimustunnit / vko</label>
                    <input
                      type="number"
                      min={0}
                      step={0.5}
                      defaultValue={employee.contract_weekly_hours || 0}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value || "0");
                        if (val !== (employee.contract_weekly_hours || 0)) {
                          updateEmployee.mutate({ id: employee.id, contract_weekly_hours: val });
                        }
                      }}
                      className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Ylityökerroin</label>
                    <input
                      type="number"
                      min={1}
                      step={0.05}
                      defaultValue={employee.overtime_multiplier || 1.5}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value || "1.5");
                        if (val !== (employee.overtime_multiplier || 1.5)) {
                          updateEmployee.mutate({ id: employee.id, overtime_multiplier: val });
                        }
                      }}
                      className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                    />
                  </div>
                </>
              )}
              </div>
              {employee.tier === "palkallinen" && (employee.hourly_rate_cents || 0) > 0 && (employee.contract_weekly_hours || 0) > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 bg-surface-hover/50 rounded-xl">
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wide">Peruspalkka / kk</p>
                    <p className="text-sm font-bold text-text-primary">{formatCents(Math.round(employee.hourly_rate_cents * employee.contract_weekly_hours * 4.2))}</p>
                    <p className="text-[10px] text-text-muted">{(employee.contract_weekly_hours * 4.2).toFixed(1)} h/kk</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wide">Työnantajakulu / kk</p>
                    <p className="text-sm font-bold text-text-secondary">{formatCents(Math.round(employee.hourly_rate_cents * employee.contract_weekly_hours * 4.2 * 1.3))}</p>
                    <p className="text-[10px] text-text-muted">sis. sivukulut 30 %</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-text-muted uppercase tracking-wide">Työnantajakulu / vuosi</p>
                    <p className="text-sm font-bold text-text-secondary">{formatCents(Math.round(employee.hourly_rate_cents * employee.contract_weekly_hours * 4.2 * 1.3 * 12))}</p>
                  </div>
                </div>
              )}
              {employee.tier === "palkallinen" && (
                <div className="p-3 bg-surface-hover/50 rounded-xl space-y-1.5">
                  <p className="text-xs font-semibold text-text-secondary">Ylityölaskenta (LVI TES)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] text-text-muted">
                    <div>
                      <p className="font-medium text-text-secondary">Päivätaso</p>
                      <p>0–8 h = normaali</p>
                      <p>8–10 h = 1.5× (50 % korotus)</p>
                      <p>10+ h = 2× (100 % korotus)</p>
                    </div>
                    <div>
                      <p className="font-medium text-text-secondary">Viikkotaso</p>
                      <p>0–{((employee.contract_weekly_hours || 0) + 2.5).toFixed(1)} h = normaali ({employee.contract_weekly_hours || 0} + 2.5 h puskuri)</p>
                      <p>seuraavat 8 h = 1.5× (50 % korotus)</p>
                      <p>sen jälkeen = 2× (100 % korotus)</p>
                    </div>
                  </div>
                </div>
              )}
              {employee.tier && employee.tier !== "palkallinen" && (
                <p className="text-xs text-text-muted pb-2">
                  Provisiot määräytyvät palvelukohtaisesti tierin "{TIER_LABELS[employee.tier]}" mukaan.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Employee-specific commissions (alihankkija) */}
        {employee.roles?.includes("installer") && employee.tier === "alihankkija" && (
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-2">Palkkiot palveluittain</h2>
            <p className="text-xs text-text-muted mb-4">Tyhjä = käytetään palvelun oletusprovisiota alihankkijalle. Aseta arvo ohittaaksesi.</p>

            {/* Service commissions */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Palvelut</p>
              {(allServices || []).filter((s) => s.active).map((svc) => {
                const ec = (employeeCommissions || []).find((c) => c.service_id === svc.id);
                return (
                  <div key={svc.id} className="flex flex-wrap items-center gap-3 py-2 border-b border-border/50 last:border-0">
                    <span className="text-sm text-text-primary w-full sm:w-auto sm:min-w-[160px]">{svc.name}</span>
                    <span className="text-xs text-text-muted">Oletus: {formatCents(svc.commission_alihankkija_cents)}</span>
                    <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                      <label className="text-[10px] text-text-muted">Provisio €</label>
                      <input
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder={String(svc.commission_alihankkija_cents / 100)}
                        defaultValue={ec ? String(ec.commission_cents / 100) : ""}
                        onBlur={async (e) => {
                          const raw = e.target.value.trim();
                          if (!raw && ec) {
                            // Clear override → delete
                            await supabase.from("employee_commissions").delete().eq("id", ec.id);
                          } else if (raw) {
                            const cents = Math.round(parseFloat(raw) * 100);
                            if (ec) {
                              await supabase.from("employee_commissions").update({ commission_cents: cents, updated_at: new Date().toISOString() }).eq("id", ec.id);
                            } else {
                              await supabase.from("employee_commissions").insert({ employee_id: employee!.id, service_id: svc.id, commission_cents: cents });
                            }
                          } else {
                            return;
                          }
                          queryClient.invalidateQueries({ queryKey: queryKeys.employeeCommissions.byEmployee(id) });
                        }}
                        className="w-20 px-2 py-1.5 border border-border rounded-lg text-sm text-right bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                      {svc.required_employees > 1 && (
                        <>
                          <label className="text-[10px] text-text-muted">2. as. €</label>
                          <input
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder={String(svc.secondary_commission_alihankkija_cents / 100)}
                            defaultValue={ec ? String(ec.secondary_commission_cents / 100) : ""}
                            onBlur={async (e) => {
                              const raw = e.target.value.trim();
                              if (!raw) return;
                              const cents = Math.round(parseFloat(raw) * 100);
                              if (ec) {
                                await supabase.from("employee_commissions").update({ secondary_commission_cents: cents, updated_at: new Date().toISOString() }).eq("id", ec.id);
                              } else {
                                await supabase.from("employee_commissions").insert({ employee_id: employee!.id, service_id: svc.id, secondary_commission_cents: cents });
                              }
                              queryClient.invalidateQueries({ queryKey: queryKeys.employeeCommissions.byEmployee(id) });
                            }}
                            className="w-20 px-2 py-1.5 border border-border rounded-lg text-sm text-right bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
                          />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Addon service commissions */}
            {(allAddons || []).filter((a) => a.active).length > 0 && (
              <div className="space-y-2 mt-6">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Lisäpalvelut</p>
                {(allAddons || []).filter((a) => a.active).map((addon) => {
                  const ec = (employeeCommissions || []).find((c) => c.addon_service_id === addon.id);
                  return (
                    <div key={addon.id} className="flex flex-wrap items-center gap-3 py-2 border-b border-border/50 last:border-0">
                      <span className="text-sm text-text-primary w-full sm:w-auto sm:min-w-[160px]">{addon.name}</span>
                      <span className="text-xs text-text-muted">Oletus: {formatCents(addon.commission_alihankkija_cents || 0)}</span>
                      <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                        <label className="text-[10px] text-text-muted">Provisio €</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder={String((addon.commission_alihankkija_cents || 0) / 100)}
                          defaultValue={ec ? String(ec.commission_cents / 100) : ""}
                          onBlur={async (e) => {
                            const raw = e.target.value.trim();
                            if (!raw && ec) {
                              await supabase.from("employee_commissions").delete().eq("id", ec.id);
                            } else if (raw) {
                              const cents = Math.round(parseFloat(raw) * 100);
                              if (ec) {
                                await supabase.from("employee_commissions").update({ commission_cents: cents, updated_at: new Date().toISOString() }).eq("id", ec.id);
                              } else {
                                await supabase.from("employee_commissions").insert({ employee_id: employee!.id, addon_service_id: addon.id, commission_cents: cents });
                              }
                            } else {
                              return;
                            }
                            queryClient.invalidateQueries({ queryKey: queryKeys.employeeCommissions.byEmployee(id) });
                          }}
                          className="w-20 px-2 py-1.5 border border-border rounded-lg text-sm text-right bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Palkallinen internal cost overrides (admin-only, inter-company invoicing) */}
        {employee.roles?.includes("installer") && employee.tier === "palkallinen" && (
          <div className="bg-surface rounded-2xl border border-border p-6">
            <div className="flex items-center gap-2 mb-1">
              <EyeOff className="w-4 h-4 text-text-muted" />
              <h2 className="font-semibold text-text-primary">Sisäiset kulut palveluittain (vain ylläpito)</h2>
            </div>
            <p className="text-xs text-text-muted mb-4">
              Mitä toinen yhtiö laskuttaa Lasikiiltoilta per keikka tästä palkallisesta asentajasta.
              Ei näy asentajalle. Tyhjä = käytetään palvelun oletusta.
            </p>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Palvelut</p>
              {(allServices || []).filter((s: Service) => s.active).map((svc: Service) => {
                const override = (palkallinenOverrides || []).find((o: PalkallinenInternalCost) => o.service_id === svc.id);
                const defaultRow = (palkallinenDefaults || []).find((d: PalkallinenInternalCost) => d.service_id === svc.id);
                const defaultCents = defaultRow?.internal_cost_cents ?? 0;
                const defaultSecondaryCents = defaultRow?.secondary_internal_cost_cents ?? 0;

                async function handleBlur(which: "primary" | "secondary", raw: string) {
                  const cents = raw.trim() ? Math.round(parseFloat(raw) * 100) : 0;
                  const currentPrimary = override?.internal_cost_cents ?? 0;
                  const currentSecondary = override?.secondary_internal_cost_cents ?? 0;
                  const nextPrimary = which === "primary" ? cents : currentPrimary;
                  const nextSecondary = which === "secondary" ? cents : currentSecondary;
                  if (nextPrimary === currentPrimary && nextSecondary === currentSecondary) return;
                  try {
                    await savePalkallinenInternalCost(
                      { kind: "service", service_id: svc.id },
                      employee!.id,
                      nextPrimary,
                      nextSecondary,
                    );
                    invalidatePalkallinen();
                  } catch {
                    // Silently ignore — next blur can retry
                  }
                }

                return (
                  <div key={svc.id} className="flex flex-wrap items-center gap-3 py-2 border-b border-border/50 last:border-0">
                    <span className="text-sm text-text-primary w-full sm:w-auto sm:min-w-[160px]">{svc.name}</span>
                    <span className="text-xs text-text-muted">Oletus: {formatCents(defaultCents)}</span>
                    <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                      <label className="text-[10px] text-text-muted">Kulu €</label>
                      <input
                        key={`pic-${svc.id}-primary-${override?.internal_cost_cents ?? "empty"}`}
                        type="number"
                        min={0}
                        step={0.01}
                        placeholder={String(defaultCents / 100)}
                        defaultValue={override ? String(override.internal_cost_cents / 100) : ""}
                        onBlur={(e) => handleBlur("primary", e.target.value)}
                        className="w-20 px-2 py-1.5 border border-border rounded-lg text-sm text-right bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
                      />
                      {svc.required_employees > 1 && (
                        <>
                          <label className="text-[10px] text-text-muted">2. as. €</label>
                          <input
                            key={`pic-${svc.id}-secondary-${override?.secondary_internal_cost_cents ?? "empty"}`}
                            type="number"
                            min={0}
                            step={0.01}
                            placeholder={String(defaultSecondaryCents / 100)}
                            defaultValue={override ? String(override.secondary_internal_cost_cents / 100) : ""}
                            onBlur={(e) => handleBlur("secondary", e.target.value)}
                            className="w-20 px-2 py-1.5 border border-border rounded-lg text-sm text-right bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
                          />
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {relevantAddons.length > 0 && (
              <div className="space-y-2 mt-6">
                <p className="text-xs font-semibold text-text-muted uppercase tracking-wide">Lisäpalvelut</p>
                {relevantAddons.map((addon) => {
                  const override = (palkallinenOverrides || []).find((o: PalkallinenInternalCost) => o.addon_service_id === addon.id);
                  const defaultRow = (palkallinenDefaults || []).find((d: PalkallinenInternalCost) => d.addon_service_id === addon.id);
                  const defaultCents = defaultRow?.internal_cost_cents ?? 0;

                  async function handleBlur(raw: string) {
                    const cents = raw.trim() ? Math.round(parseFloat(raw) * 100) : 0;
                    const current = override?.internal_cost_cents ?? 0;
                    if (cents === current) return;
                    try {
                      await savePalkallinenInternalCost(
                        { kind: "addon", addon_service_id: addon.id },
                        employee!.id,
                        cents,
                        0,
                      );
                      invalidatePalkallinen();
                    } catch {
                      // silently ignore
                    }
                  }

                  return (
                    <div key={addon.id} className="flex flex-wrap items-center gap-3 py-2 border-b border-border/50 last:border-0">
                      <span className="text-sm text-text-primary w-full sm:w-auto sm:min-w-[160px]">{addon.name}</span>
                      <span className="text-xs text-text-muted">Oletus: {formatCents(defaultCents)}</span>
                      <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto">
                        <label className="text-[10px] text-text-muted">Kulu €</label>
                        <input
                          key={`pic-addon-${addon.id}-${override?.internal_cost_cents ?? "empty"}`}
                          type="number"
                          min={0}
                          step={0.01}
                          placeholder={String(defaultCents / 100)}
                          defaultValue={override ? String(override.internal_cost_cents / 100) : ""}
                          onBlur={(e) => handleBlur(e.target.value)}
                          className="w-20 px-2 py-1.5 border border-border rounded-lg text-sm text-right bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Seller Ref Code */}
        {employee.roles?.includes("seller") && (
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-4">Viitekoodi (Landing Page -seuranta)</h2>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Ref-koodi</label>
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  placeholder="esim. matti-v"
                  defaultValue={employee.ref_code || ""}
                  onBlur={(e) => {
                    const val = e.target.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "") || null;
                    if (val !== (employee.ref_code || null)) {
                      updateEmployee.mutate({ id: employee.id, ref_code: val });
                    }
                  }}
                  className="w-full sm:max-w-xs px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
                {employee.ref_code && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(`https://lasikiilto.fi/?ref=${employee.ref_code}`);
                    }}
                    className="shrink-0 text-xs text-accent hover:underline"
                  >
                    Kopioi linkki
                  </button>
                )}
              </div>
              <p className="text-xs text-text-muted mt-2">
                Käytetään URL-parametrina: lasikiilto.fi/sivu?ref=<span className="font-medium">{employee.ref_code || "koodi"}</span>
              </p>
            </div>
          </div>
        )}

        {/* Google Calendar Sync (installers only) */}
        {employee.roles?.includes("installer") && (
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-4">Google-kalenterisynkronointi</h2>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Google Calendar ID</label>
              <input
                type="text"
                placeholder={employee.email || "asentaja@esimerkki.fi"}
                defaultValue={employee.google_calendar_id || ""}
                onBlur={(e) => {
                  const val = e.target.value.trim() || null;
                  if (val !== employee.google_calendar_id) {
                    updateEmployee.mutate({ id: employee.id, google_calendar_id: val });
                  }
                }}
                className="w-full sm:max-w-sm px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
              <p className="text-xs text-text-muted mt-2">
                Asentajan Google-kalenterin tapahtumat estävät automaattisesti varaukset. Synkronointi tapahtuu reaaliaikaisesti push-notifikaatioilla.
              </p>
            </div>
          </div>
        )}

        {/* Service Priorities */}
        {employee.roles?.includes("installer") && assignedServiceIds.length > 0 && (
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-2">Palveluprioriteetit</h2>
            <p className="text-sm text-text-muted mb-4">Korkeamman prioriteetin asentajat valitaan ensin samalle aikavälille.</p>
            <div className="space-y-2">
              {assignedServiceIds.map((sid: string) => {
                const svc = allServices?.find((s) => s.id === sid);
                const prio = (employee.employee_service_priorities || []).find((p) => p.service_id === sid)?.priority || "medium";
                return (
                  <div key={sid} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <span className="text-sm text-text-secondary min-w-[140px]">{svc?.name || "–"}</span>
                    <div className="flex gap-1">
                      {(["high", "medium", "low"] as const).map((level) => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => {
                            setServicePriority.mutate({ employeeId: employee.id, serviceId: sid, priority: level });
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            prio === level
                              ? level === "high"
                                ? "bg-green-50 text-green-700 border-green-300"
                                : level === "medium"
                                  ? "bg-yellow-50 text-yellow-700 border-yellow-300"
                                  : "bg-red-50 text-red-700 border-red-300"
                              : "bg-surface text-text-muted border-border hover:border-border-strong"
                          }`}
                        >
                          {level === "high" ? "Korkea" : level === "medium" ? "Keski" : "Matala"}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Assigned Services */}
        <div className="bg-surface rounded-2xl border border-border p-6">
          <h2 className="font-semibold text-text-primary mb-4">Palvelut</h2>
          <p className="text-sm text-text-muted mb-4">Valitse mitä palveluita tämä työntekijä voi suorittaa.</p>
          <div className="flex flex-wrap gap-2">
            {allServices?.map((svc) => {
              const assigned = assignedServiceIds.includes(svc.id);
              return (
                <button key={svc.id} onClick={() => toggleService(svc.id)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                    assigned
                      ? "bg-accent-muted text-accent-dark border-accent/30"
                      : "bg-surface-alt text-text-secondary border-border hover:border-border-strong"
                  }`}>
                  {svc.name}
                </button>
              );
            })}
            {(!allServices || allServices.length === 0) && (
              <p className="text-sm text-text-muted">Ei palveluita luotu. <Link to="/palvelut" className="text-accent-dark hover:underline">Luo palvelu →</Link></p>
            )}
          </div>
        </div>

        {/* Addon Services */}
        {relevantAddons.length > 0 && (
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-2">Lisäpalvelut</h2>
            <p className="text-sm text-text-muted mb-4">Oletuksena työntekijä tekee kaikkia lisäpalveluita. Poista valinta niistä, joita hän ei suorita.</p>
            <div className="flex flex-wrap gap-2">
              {relevantAddons.map((addon) => {
                const excluded = addonExclusions?.has(addon.id) ?? false;
                return (
                  <button key={addon.id} onClick={() => toggleAddonExclusion(addon.id)}
                    disabled={setAddonExclusions.isPending}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                      !excluded
                        ? "bg-accent-muted text-accent-dark border-accent/30"
                        : "bg-surface-alt text-text-muted border-border line-through opacity-60"
                    }`}>
                    {addon.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Service Areas */}
        {employee.roles?.includes("installer") && (
          <div className="bg-surface rounded-2xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-text-primary">Palvelualueet</h2>
              <button onClick={() => { setShowAreaForm(!showAreaForm); setEditingAreaId(null); setAreaForm({ name: "", description: "", postal_codes: [], mode: "manual", center_postal: "", radius_km: "" }); }}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-light transition-colors whitespace-nowrap">
                <Plus className="w-4 h-4" /> Lisää alue
              </button>
            </div>

            {showAreaForm && (
              <form onSubmit={async (ev) => {
                ev.preventDefault();
                setAreaError("");
                let codes = areaForm.postal_codes;
                let centerPostal: string | null = null;
                let radiusKm: number | null = null;
                if (areaForm.mode === "radius") {
                  if (!areaForm.center_postal || !areaForm.radius_km) { setAreaError("Syötä postinumero ja säde"); return; }
                  centerPostal = areaForm.center_postal;
                  radiusKm = Number(areaForm.radius_km);
                  codes = postalCodesWithinRadius(centerPostal, radiusKm);
                  if (codes.length === 0) { setAreaError("Postinumeroa ei löytynyt tai säteellä ei ole postinumeroita"); return; }
                }
                if (codes.length === 0) { setAreaError("Valitse vähintään yksi postinumero"); return; }
                try {
                  if (editingAreaId) {
                    await updateServiceArea.mutateAsync({ id: editingAreaId, name: areaForm.name, description: areaForm.description || null, postal_codes: codes, center_postal: centerPostal, radius_km: radiusKm });
                  } else {
                    await createServiceArea.mutateAsync({ employee_id: employee!.id, name: areaForm.name, description: areaForm.description || undefined, postal_codes: codes, center_postal: centerPostal, radius_km: radiusKm });
                  }
                  setShowAreaForm(false);
                  setEditingAreaId(null);
                  setAreaForm({ name: "", description: "", postal_codes: [], mode: "manual", center_postal: "", radius_km: "" });
                } catch (err: unknown) {
                  setAreaError(err instanceof Error ? err.message : "Virhe");
                }
              }} className="bg-surface-alt rounded-xl p-5 mb-5 space-y-4">
                {areaError && <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{areaError}</div>}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Alueen nimi *</label>
                    <input type="text" required value={areaForm.name} onChange={(e) => setAreaForm({ ...areaForm, name: e.target.value })}
                      placeholder="esim. Pääkaupunkiseutu"
                      className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Kuvaus</label>
                    <input type="text" value={areaForm.description} onChange={(e) => setAreaForm({ ...areaForm, description: e.target.value })}
                      className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
                  </div>
                </div>

                {/* Mode toggle */}
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Valintatapa</label>
                  <div className="flex gap-1 p-1 bg-surface rounded-xl border border-border w-fit">
                    <button type="button" onClick={() => setAreaForm({ ...areaForm, mode: "manual" })}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${areaForm.mode === "manual" ? "bg-accent text-white shadow-sm" : "text-text-secondary hover:text-text-primary"}`}>
                      Postinumerot
                    </button>
                    <button type="button" onClick={() => setAreaForm({ ...areaForm, mode: "radius" })}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${areaForm.mode === "radius" ? "bg-accent text-white shadow-sm" : "text-text-secondary hover:text-text-primary"}`}>
                      Etäisyys postinumerosta
                    </button>
                  </div>
                </div>

                {areaForm.mode === "radius" ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Keskipostinumero *</label>
                        <input type="text" inputMode="numeric" maxLength={5} value={areaForm.center_postal}
                          onChange={(e) => {
                            const v = e.target.value.replace(/\D/g, "").slice(0, 5);
                            setAreaForm({ ...areaForm, center_postal: v });
                          }}
                          placeholder="esim. 40100"
                          className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Säde (km) *</label>
                        <input type="number" min={1} max={300} step={1} value={areaForm.radius_km}
                          onChange={(e) => setAreaForm({ ...areaForm, radius_km: e.target.value })}
                          placeholder="esim. 40"
                          className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
                      </div>
                    </div>
                    {areaForm.center_postal.length === 5 && areaForm.radius_km && Number(areaForm.radius_km) > 0 && (
                      <Suspense fallback={
                        <div className="h-80 rounded-xl border border-border bg-surface-alt flex items-center justify-center text-sm text-text-muted">
                          Ladataan karttaa…
                        </div>
                      }>
                        <ServiceAreaMap
                          centerPostal={areaForm.center_postal}
                          radiusKm={Number(areaForm.radius_km)}
                        />
                      </Suspense>
                    )}
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Postinumerot *</label>
                    <PostalCodePicker
                      selected={areaForm.postal_codes}
                      onChange={(codes) => setAreaForm({ ...areaForm, postal_codes: codes })}
                    />
                  </div>
                )}

                <div className="flex gap-3">
                  <button type="submit" disabled={createServiceArea.isPending || updateServiceArea.isPending}
                    className="px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
                    {editingAreaId ? "Tallenna" : "Luo alue"}
                  </button>
                  <button type="button" onClick={() => { setShowAreaForm(false); setEditingAreaId(null); }}
                    className="px-5 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors">
                    Peruuta
                  </button>
                </div>
              </form>
            )}

            {!serviceAreas || serviceAreas.length === 0 ? (
              <p className="text-sm text-text-muted">Ei palvelualueita</p>
            ) : (
              <div className="space-y-3">
                {serviceAreas.map((area) => (
                  <div key={area.id} className="p-4 rounded-xl border border-border">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3">
                        <MapPin className="w-4 h-4 text-blue-600 mt-0.5" />
                        <div>
                          <p className="font-medium text-sm text-text-primary">{area.name}</p>
                          {area.description && <p className="text-xs text-text-muted">{area.description}</p>}
                          <p className="text-xs text-text-muted mt-1">
                            {area.center_postal && area.radius_km
                              ? <><span className="font-medium">{area.radius_km} km</span> postinumerosta {area.center_postal} &middot; </>
                              : null}
                            {postalCodesToCities(area.postal_codes).join(", ") || "–"}
                            <span className="text-text-muted/60 ml-1">({area.postal_codes.length} postinumeroa)</span>
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => {
                          setEditingAreaId(area.id);
                          setAreaForm({ name: area.name, description: area.description || "", postal_codes: [...area.postal_codes], mode: area.center_postal ? "radius" : "manual", center_postal: area.center_postal || "", radius_km: area.radius_km ? String(area.radius_km) : "" });
                          setShowAreaForm(true);
                        }} className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-hover transition-all">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={async () => { if (await confirm({ message: `Poistetaanko "${area.name}"?`, confirmLabel: "Poista", variant: "danger" })) deleteServiceArea.mutate(area.id); }}
                          className="p-2 text-text-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Calendars */}
        {employee.roles?.includes("installer") && (
          <div className="bg-surface rounded-2xl border border-border p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-text-primary">Kalenterit</h2>
              <button onClick={() => setShowCalendarForm(!showCalendarForm)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-light transition-colors whitespace-nowrap">
                <Plus className="w-4 h-4" /> Luo kalenteri
              </button>
            </div>

            {showCalendarForm && (
              <form onSubmit={handleCreateCalendar} className="bg-surface-alt rounded-xl p-5 mb-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Palvelut *</label>
                  <div className="flex flex-wrap gap-2">
                    {allServices?.filter((s) => assignedServiceIds.includes(s.id)).map((s) => {
                      const selected = calForm.service_ids.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setCalForm((prev) => ({
                              ...prev,
                              service_ids: selected
                                ? prev.service_ids.filter((id) => id !== s.id)
                                : [...prev.service_ids, s.id],
                            }));
                          }}
                          className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                            selected
                              ? "bg-accent-muted text-accent-dark border-accent/30"
                              : "bg-surface text-text-secondary border-border hover:border-border-strong"
                          }`}
                        >
                          {s.name}
                        </button>
                      );
                    })}
                  </div>
                  {(!allServices || allServices.filter((s) => assignedServiceIds.includes(s.id)).length === 0) && (
                    <p className="text-sm text-text-muted mt-2">Lisää ensin palveluita työntekijälle.</p>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Palvelualueet *</label>
                  <div className="flex flex-wrap gap-2">
                    {serviceAreas?.map((sa) => {
                      const selected = calForm.service_area_ids.includes(sa.id);
                      return (
                        <button
                          key={sa.id}
                          type="button"
                          onClick={() => {
                            setCalForm((prev) => ({
                              ...prev,
                              service_area_ids: selected
                                ? prev.service_area_ids.filter((id) => id !== sa.id)
                                : [...prev.service_area_ids, sa.id],
                            }));
                          }}
                          className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                            selected
                              ? "bg-accent-muted text-accent-dark border-accent/30"
                              : "bg-surface text-text-secondary border-border hover:border-border-strong"
                          }`}
                        >
                          {sa.name}
                        </button>
                      );
                    })}
                    {(!serviceAreas || serviceAreas.length === 0) && (
                      <p className="text-sm text-text-muted">Ei palvelualueita luotu.</p>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Nimi *</label>
                  <input type="text" required value={calForm.name}
                    onChange={(e) => setCalForm({ ...calForm, name: e.target.value })}
                    placeholder="esim. ILP-huolto PKS"
                    className="w-full max-w-sm px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
                </div>
                <div className="flex gap-3">
                  <button type="submit" disabled={createCalendar.isPending || calForm.service_ids.length === 0 || calForm.service_area_ids.length === 0}
                    className="px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
                    Luo kalenteri
                  </button>
                  <button type="button" onClick={() => setShowCalendarForm(false)}
                    className="px-5 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors">
                    Peruuta
                  </button>
                </div>
              </form>
            )}

            {!calendars || calendars.length === 0 ? (
              <p className="text-sm text-text-muted">Ei kalentereita</p>
            ) : (
              <div className="space-y-3">
                {calendars.map((cal) => (
                  <div key={cal.id}>
                    <div
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        selectedCalendar?.id === cal.id
                          ? "border-accent bg-accent-muted"
                          : "border-border hover:border-border-strong"
                      }`}
                      onClick={() => {
                        setSelectedCalendar(selectedCalendar?.id === cal.id ? null : cal);
                      }}>
                      <div className="flex items-start sm:items-center justify-between gap-2">
                        <div className="flex items-start gap-3 min-w-0">
                          <Calendar className="w-4 h-4 text-accent-dark mt-0.5 sm:mt-0 flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium text-sm text-text-primary">{cal.name}</p>
                            <p className="text-xs text-text-muted break-words">
                              {(cal.calendar_services || []).map((cs) => allServices?.find((s) => s.id === cs.service_id)?.name).filter(Boolean).join(", ") || "–"}
                              {" — "}
                              {(cal.calendar_service_areas || []).map((csa) => serviceAreas?.find((a) => a.id === csa.service_area_id)?.name).filter(Boolean).join(", ") || "–"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <button onClick={async (e) => {
                            e.stopPropagation();
                            if (await confirm({ message: `Poistetaanko kalenteri "${cal.name}"?`, confirmLabel: "Poista", variant: "danger" })) {
                              if (selectedCalendar?.id === cal.id) setSelectedCalendar(null);
                              deleteCalendar.mutate(cal.id);
                            }
                          }}
                            className="p-2 text-text-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-all">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Calendar Schedule Editor */}
        {selectedCalendar && (
          <CalendarScheduleEditor
            calendar={selectedCalendar}
            allServices={allServices?.filter((s) => assignedServiceIds.includes(s.id)) || []}
            serviceAreas={serviceAreas || []}
            updateCalendar={updateCalendar}
          />
        )}
      </div>
    </div>
  );
}

const DAYS = [
  { num: 1, short: "Ma" },
  { num: 2, short: "Ti" },
  { num: 3, short: "Ke" },
  { num: 4, short: "To" },
  { num: 5, short: "Pe" },
  { num: 6, short: "La" },
  { num: 7, short: "Su" },
];


/** Normalize "HH:MM:SS" or "HH:MM" to "HH:MM" */
function normalizeTime(t: string): string {
  return t.slice(0, 5);
}

const MINI_WEEKDAYS = ["Ma", "Ti", "Ke", "To", "Pe", "La", "Su"];
const MINI_MONTHS = MONTH_NAMES_FI;

const FINNISH_HOLIDAY_NAMES = new Set([
  "Uudenvuodenpäivä", "Loppiainen", "Pitkäperjantai", "Pääsiäispäivä",
  "2. pääsiäispäivä", "Vappu", "Helatorstai", "Juhannusaatto",
  "Juhannuspäivä", "Pyhäinpäivä", "Itsenäisyyspäivä", "Jouluaatto",
  "Joulupäivä", "Tapaninpäivä",
]);

function HolidaySection({
  holidays,
  deleteOverride,
}: {
  holidays: CalendarOverride[];
  deleteOverride: ReturnType<typeof useDeleteOverride>;
}) {
  const [expanded, setExpanded] = useState(false);
  if (holidays.length === 0) return null;

  const sorted = [...holidays].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="space-y-3">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-between w-full group"
      >
        <div className="flex items-center gap-3">
          <PartyPopper className="w-5 h-5 text-amber-500" />
          <h2 className="font-semibold text-text-primary">
            Juhlapyhät{" "}
            <span className="text-text-muted font-normal">({holidays.length})</span>
          </h2>
        </div>
        <ChevronDown className={`w-4 h-4 text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`} />
      </button>

      {expanded && (
        <div className="space-y-2">
          {sorted.map((o) => (
            <div key={o.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-3 rounded-xl bg-amber-50 border border-amber-200/50">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                <span className="text-sm font-medium text-text-primary whitespace-nowrap">{formatDate(o.date)}</span>
                <Badge className="bg-amber-100 text-amber-700 border border-amber-200">Koko päivä</Badge>
                {o.reason && <span className="text-xs text-amber-600 truncate">{o.reason}</span>}
              </div>
              <button
                onClick={() => deleteOverride.mutate(o.id)}
                className="p-2 rounded-lg transition-all flex-shrink-0 self-end sm:self-auto text-amber-400 hover:text-red-600 hover:bg-red-100"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OverrideSection({
  calendarId,
  overrides,
  type,
  createOverride,
  deleteOverride,
}: {
  calendarId: string;
  overrides: CalendarOverride[];
  type: "available" | "blocked";
  createOverride: ReturnType<typeof useCreateOverride>;
  deleteOverride: ReturnType<typeof useDeleteOverride>;
}) {
  const isBlocked = type === "blocked";
  const [expanded, setExpanded] = useState(false);
  const [calYear, setCalYear] = useState(() => new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(() => new Date().getMonth());
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [reason, setReason] = useState("");

  const lastDay = new Date(calYear, calMonth + 1, 0).getDate();
  const calendarCells = useMemo(() => {
    const firstDay = new Date(calYear, calMonth, 1);
    let startDay = firstDay.getDay() - 1;
    if (startDay < 0) startDay = 6;
    const cells: (number | null)[] = [];
    for (let i = 0; i < startDay; i++) cells.push(null);
    for (let d = 1; d <= lastDay; d++) cells.push(d);
    return cells;
  }, [calYear, calMonth, lastDay]);

  const overrideDates = new Set(overrides.map((o) => o.date));
  const today = new Date().toISOString().split("T")[0];

  function prevMonth() {
    if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11); }
    else setCalMonth(calMonth - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); }
    else setCalMonth(calMonth + 1);
  }

  function handleDateClick(dateKey: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateKey)) next.delete(dateKey);
      else next.add(dateKey);
      return next;
    });
  }

  function removeDate(dateKey: string) {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      next.delete(dateKey);
      return next;
    });
  }

  async function handleAdd() {
    if (selectedDates.size === 0) return;
    for (const date of [...selectedDates].sort()) {
      await createOverride.mutateAsync({
        calendar_id: calendarId,
        date,
        start_time: startTime || null,
        end_time: endTime || null,
        override_type: type,
        reason: reason || undefined,
      });
    }
    setSelectedDates(new Set());
    setStartTime("");
    setEndTime("");
    setReason("");
  }

  function handleClose() {
    setExpanded(false);
    setSelectedDates(new Set());
    setStartTime("");
    setEndTime("");
    setReason("");
  }

  const accentBg = isBlocked ? "bg-red-50" : "bg-accent-muted/30";
  const accentBorder = isBlocked ? "border-red-200/50" : "border-accent/20";
  const accentDot = isBlocked ? "bg-red-400" : "bg-accent-dark";
  const accentRing = isBlocked ? "ring-red-400 bg-red-500 text-white" : "ring-accent bg-accent text-white";
  const badgeCls = isBlocked ? "bg-red-100 text-red-600 border border-red-200" : "bg-accent-muted text-accent-dark border border-accent/30";
  const btnCls = isBlocked
    ? "bg-red-500 hover:bg-red-600 text-white"
    : "bg-accent hover:bg-accent-dark text-white";

  const existingSelected = [...selectedDates].filter((d) => overrideDates.has(d)).sort();

  return (
    <div className="space-y-4">
      {/* Header with toggle button */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Calendar className={`w-5 h-5 ${isBlocked ? "text-red-500" : "text-accent-dark"}`} />
          <h2 className="font-semibold text-text-primary">
            {isBlocked ? "Estetyt ajat" : "Lisäsaatavuus"}{" "}
            <span className="text-text-muted font-normal">({overrides.length})</span>
          </h2>
        </div>
        <button
          onClick={() => expanded ? handleClose() : setExpanded(true)}
          className={`inline-flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
            isBlocked
              ? "border-red-200 text-red-600 hover:bg-red-50"
              : "border-accent text-accent-dark hover:bg-accent-muted"
          }`}
        >
          {expanded ? (
            <><X className="w-4 h-4" /> Sulje</>
          ) : (
            <><Plus className="w-4 h-4" /> Hallinnoi aikoja</>
          )}
        </button>
      </div>

      {/* Override list (always visible) */}
      {overrides.length > 0 && (
        <div className="space-y-2">
          {overrides
            .sort((a, b) => a.date.localeCompare(b.date))
            .map((o) => (
            <div key={o.id} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-3 rounded-xl ${accentBg} border ${accentBorder}`}>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                <span className="text-sm font-medium text-text-primary whitespace-nowrap">{formatDate(o.date)}</span>
                <Badge className={badgeCls}>
                  {o.start_time
                    ? `${normalizeTime(o.start_time)}${o.end_time ? ` – ${normalizeTime(o.end_time)}` : ""}`
                    : "Koko päivä"}
                </Badge>
                {o.reason && <span className="text-xs text-text-muted truncate">{o.reason}</span>}
              </div>
              <button
                onClick={() => deleteOverride.mutate(o.id)}
                className={`p-2 rounded-lg transition-all flex-shrink-0 self-end sm:self-auto ${
                  isBlocked
                    ? "text-red-400 hover:text-red-600 hover:bg-red-100"
                    : "text-text-muted hover:text-red-600 hover:bg-red-50"
                }`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {overrides.length === 0 && !expanded && (
        <p className="text-sm text-text-muted py-2">
          {isBlocked ? "Ei estettyjä aikoja" : "Ei lisäsaatavuuksia"}
        </p>
      )}

      {/* Expandable calendar picker */}
      {expanded && (
        <div className="bg-surface-alt rounded-xl border border-border p-5 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Mini calendar */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="p-1.5 hover:bg-surface-hover rounded-lg transition-colors">
                  <ChevronLeft className="w-4 h-4 text-text-secondary" />
                </button>
                <span className="text-sm font-semibold text-text-primary">
                  {MINI_MONTHS[calMonth]} {calYear}
                </span>
                <button onClick={nextMonth} className="p-1.5 hover:bg-surface-hover rounded-lg transition-colors">
                  <ChevronRight className="w-4 h-4 text-text-secondary" />
                </button>
              </div>

              <div className="grid grid-cols-7 mb-1">
                {MINI_WEEKDAYS.map((d) => (
                  <div key={d} className="text-center text-[10px] font-semibold text-text-muted uppercase py-1">
                    {d}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5">
                {calendarCells.map((day, i) => {
                  if (day === null) return <div key={`e-${i}`} />;
                  const dateKey = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                  const hasOverride = overrideDates.has(dateKey);
                  const isSelected = selectedDates.has(dateKey);
                  const isToday = dateKey === today;
                  const isPast = dateKey < today;

                  return (
                    <button
                      key={dateKey}
                      onClick={() => !isPast && handleDateClick(dateKey)}
                      disabled={isPast}
                      className={`aspect-square rounded-lg text-xs font-medium flex flex-col items-center justify-center relative transition-all ${
                        isPast
                          ? "text-text-muted/30 cursor-not-allowed"
                          : isSelected
                          ? `${accentRing} ring-2 shadow-sm`
                          : hasOverride
                          ? `${accentBg} ${isBlocked ? "text-red-600" : "text-accent-dark"} font-semibold`
                          : "hover:bg-surface-hover text-text-primary"
                      } ${isToday && !isSelected ? "font-bold" : ""}`}
                    >
                      {day}
                      {hasOverride && !isSelected && (
                        <span className={`absolute bottom-0.5 w-1 h-1 rounded-full ${accentDot}`} />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right side: selected dates + form */}
            <div className="space-y-4">
              {selectedDates.size > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                      {selectedDates.size} {selectedDates.size === 1 ? "päivä" : "päivää"} valittu
                    </span>
                    <button onClick={() => setSelectedDates(new Set())} className="text-xs text-text-muted hover:text-text-primary transition-colors">
                      Tyhjennä
                    </button>
                  </div>

                  {/* Selected date chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {[...selectedDates].sort().map((d) => {
                      const existing = overrides.find((o) => o.date === d);
                      return (
                        <span key={d} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${
                          existing ? "bg-surface border border-border text-text-muted" : `${isBlocked ? "bg-red-100 text-red-700" : "bg-accent-muted text-accent-dark"}`
                        }`}>
                          {new Date(d + "T00:00:00").toLocaleDateString("fi-FI", { day: "numeric", month: "numeric", timeZone: "Europe/Helsinki" })}
                          {existing && " ✓"}
                          <button onClick={() => removeDate(d)} className="hover:opacity-60 ml-0.5">
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })}
                  </div>

                  {/* Existing selected — show with delete */}
                  {existingSelected.length > 0 && (
                    <div className="space-y-1.5">
                      <span className="text-[10px] font-semibold text-text-muted uppercase tracking-wide">Jo lisätyt</span>
                      {existingSelected.map((d) => {
                        const o = overrides.find((ov) => ov.date === d)!;
                        return (
                          <div key={o.id} className="flex items-center justify-between p-2 rounded-lg bg-surface border border-border">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium text-text-primary">{formatDate(o.date)}</span>
                              <Badge className={badgeCls + " text-[10px]"}>
                                {o.start_time ? `${normalizeTime(o.start_time)}${o.end_time ? ` – ${normalizeTime(o.end_time)}` : ""}` : "Koko päivä"}
                              </Badge>
                            </div>
                            <button onClick={() => { deleteOverride.mutate(o.id); removeDate(d); }}
                              className="p-1 text-text-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Add block form */}
                  {selectedDates.size > 0 && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Aloitus</label>
                          <TimePicker value={startTime} onChange={(v) => { setStartTime(v); if (!v) setEndTime(""); }} placeholder="Koko päivä" className="w-full" />
                        </div>
                        {startTime && (
                          <div>
                            <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Lopetus</label>
                            <TimePicker value={endTime} onChange={setEndTime} placeholder="–" minTime={startTime} className="w-full" />
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1">Syy</label>
                        <input
                          type="text"
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          placeholder={isBlocked ? "esim. Loma, sairaus..." : "esim. Ylimääräinen vuoro..."}
                          className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                        />
                      </div>
                      <button
                        onClick={handleAdd}
                        disabled={createOverride.isPending}
                        className={`w-full px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${btnCls}`}
                      >
                        {isBlocked ? "Estä" : "Lisää saatavuus"} ({selectedDates.size} {selectedDates.size === 1 ? "päivä" : "päivää"})
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-text-muted">Valitse päiviä kalenterista</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CalendarScheduleEditor({ calendar, allServices, serviceAreas, updateCalendar }: {
  calendar: InstallerCalendar;
  allServices: Service[];
  serviceAreas: ServiceArea[];
  updateCalendar: ReturnType<typeof useUpdateCalendar>;
}) {
  const [editName, setEditName] = useState(calendar.name);
  const [editServiceIds, setEditServiceIds] = useState<string[]>(
    (calendar.calendar_services || []).map((cs) => cs.service_id)
  );
  const [editAreaIds, setEditAreaIds] = useState<string[]>(
    (calendar.calendar_service_areas || []).map((csa) => csa.service_area_id)
  );
  const [settingsDirty, setSettingsDirty] = useState(false);

  // Reset local state when calendar changes
  const [prevCalId, setPrevCalId] = useState(calendar.id);
  if (calendar.id !== prevCalId) {
    setPrevCalId(calendar.id);
    setEditName(calendar.name);
    setEditServiceIds((calendar.calendar_services || []).map((cs) => cs.service_id));
    setEditAreaIds((calendar.calendar_service_areas || []).map((csa) => csa.service_area_id));
    setSettingsDirty(false);
  }

  const { data: weeklySlots } = useWeeklySlots(calendar.id);
  const setWeekly = useSetWeeklySlots();
  const { data: overrides } = useCalendarOverrides(calendar.id);
  const createOverride = useCreateOverride();
  const deleteOverride = useDeleteOverride();


  // Group weekly slots by day: { dayNum: { start_time, end_time } }
  const slotsByDay: Record<number, { start_time: string; end_time: string }> = {};
  if (weeklySlots) {
    for (const s of weeklySlots) {
      const st = normalizeTime(s.start_time);
      const et = normalizeTime(s.end_time);
      if (!slotsByDay[s.day_of_week]) {
        slotsByDay[s.day_of_week] = { start_time: st, end_time: et };
      } else {
        if (st < slotsByDay[s.day_of_week].start_time) slotsByDay[s.day_of_week].start_time = st;
        if (et > slotsByDay[s.day_of_week].end_time) slotsByDay[s.day_of_week].end_time = et;
      }
    }
  }

  const activeDays = new Set(Object.keys(slotsByDay).map(Number));

  function toggleDay(day: number) {
    const current = weeklySlots || [];
    if (activeDays.has(day)) {
      // Remove all slots for this day
      const next = current.filter((s) => s.day_of_week !== day);
      setWeekly.mutate({
        calendarId: calendar.id,
        slots: next.map((s) => ({ day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time })),
      });
    } else {
      // Add default 08:00-16:00
      const next = [...current, { day_of_week: day, start_time: "08:00", end_time: "16:00" }];
      setWeekly.mutate({
        calendarId: calendar.id,
        slots: next.map((s) => ({ day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time })),
      });
    }
  }

  function updateDayTime(day: number, field: "start_time" | "end_time", value: string) {
    const current = weeklySlots || [];
    // Remove existing slots for this day, add new single range
    const others = current.filter((s) => s.day_of_week !== day);
    const existing = slotsByDay[day] || { start_time: "08:00", end_time: "16:00" };
    const updated = { ...existing, [field]: value };
    if (updated.start_time >= updated.end_time) return;
    const next = [...others, { day_of_week: day, start_time: updated.start_time, end_time: updated.end_time }];
    setWeekly.mutate({
      calendarId: calendar.id,
      slots: next.map((s) => ({ day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time })),
    });
  }

  const manualOverrides = overrides?.filter((o) => o.reason !== "google_calendar_sync") || [];
  const availableOverrides = manualOverrides.filter((o) => o.override_type === "available");
  const allBlocked = manualOverrides.filter((o) => o.override_type === "blocked");
  const holidayOverrides = allBlocked.filter((o) => o.reason && FINNISH_HOLIDAY_NAMES.has(o.reason));
  const blockedOverrides = allBlocked.filter((o) => !o.reason || !FINNISH_HOLIDAY_NAMES.has(o.reason));

  return (
    <div className="bg-surface rounded-2xl border border-border p-6 space-y-8">
      {/* Basic settings */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <Pencil className="w-5 h-5 text-accent-dark" />
          <h2 className="font-semibold text-text-primary">Perustiedot</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Nimi</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => { setEditName(e.target.value); setSettingsDirty(true); }}
              className="w-full max-w-sm px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Palvelut</label>
            <div className="flex flex-wrap gap-2">
              {allServices.map((s) => {
                const selected = editServiceIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => {
                      setEditServiceIds((prev) => selected ? prev.filter((id) => id !== s.id) : [...prev, s.id]);
                      setSettingsDirty(true);
                    }}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                      selected
                        ? "bg-accent-muted text-accent-dark border-accent/30"
                        : "bg-surface text-text-secondary border-border hover:border-border-strong"
                    }`}
                  >
                    {s.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Palvelualueet</label>
            <div className="flex flex-wrap gap-2">
              {serviceAreas.map((sa) => {
                const selected = editAreaIds.includes(sa.id);
                return (
                  <button
                    key={sa.id}
                    type="button"
                    onClick={() => {
                      setEditAreaIds((prev) => selected ? prev.filter((id) => id !== sa.id) : [...prev, sa.id]);
                      setSettingsDirty(true);
                    }}
                    className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                      selected
                        ? "bg-accent-muted text-accent-dark border-accent/30"
                        : "bg-surface text-text-secondary border-border hover:border-border-strong"
                    }`}
                  >
                    {sa.name}
                  </button>
                );
              })}
              {serviceAreas.length === 0 && (
                <p className="text-sm text-text-muted">Ei palvelualueita luotu.</p>
              )}
            </div>
          </div>

          {settingsDirty && (
            <button
              type="button"
              disabled={updateCalendar.isPending || editServiceIds.length === 0 || editAreaIds.length === 0 || !editName.trim()}
              onClick={async () => {
                await updateCalendar.mutateAsync({
                  id: calendar.id,
                  service_ids: editServiceIds,
                  service_area_ids: editAreaIds,
                  name: editName,
                });
                setSettingsDirty(false);
              }}
              className="px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              Tallenna muutokset
            </button>
          )}
        </div>
      </div>

      {/* Weekly availability */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <Calendar className="w-5 h-5 text-accent-dark" />
          <h2 className="font-semibold text-text-primary">Viikottainen saatavuus</h2>
        </div>

        {/* Day toggles */}
        <div className="flex flex-wrap gap-2 mb-5">
          {DAYS.map((d) => (
            <button
              key={d.num}
              onClick={() => toggleDay(d.num)}
              className={`w-10 h-10 rounded-full text-sm font-semibold transition-all ${
                activeDays.has(d.num)
                  ? "bg-accent text-white"
                  : "bg-surface-alt text-text-muted border border-border hover:border-accent/50"
              }`}
            >
              {d.short}
            </button>
          ))}
        </div>

        {/* Time ranges per active day */}
        <div className="space-y-2">
          {DAYS.filter((d) => activeDays.has(d.num)).map((d) => {
            const slot = slotsByDay[d.num];
            return (
              <div key={d.num} className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-accent-muted/30 border border-accent/20">
                <span className="text-sm font-semibold text-accent-dark w-8">{d.short}</span>
                <TimePicker value={slot?.start_time || "08:00"} onChange={(v) => updateDayTime(d.num, "start_time", v)} placeholder="Alku" />
                <span className="text-text-muted">–</span>
                <TimePicker value={slot?.end_time || "16:00"} onChange={(v) => updateDayTime(d.num, "end_time", v)} placeholder="Loppu" />
                <div className="flex-1" />
                <button
                  onClick={() => toggleDay(d.num)}
                  className="p-2 text-text-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-all"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
          {activeDays.size === 0 && (
            <p className="text-sm text-text-muted py-2">Ei päiviä valittuna. Klikkaa päivää lisätäksesi saatavuuden.</p>
          )}
        </div>
      </div>

      {/* Extra availability */}
      <OverrideSection
        calendarId={calendar.id}
        overrides={availableOverrides}
        type="available"
        createOverride={createOverride}
        deleteOverride={deleteOverride}
      />

      {/* Blocked days */}
      <OverrideSection
        calendarId={calendar.id}
        overrides={blockedOverrides}
        type="blocked"
        createOverride={createOverride}
        deleteOverride={deleteOverride}
      />

      {/* Finnish public holidays */}
      <HolidaySection
        holidays={holidayOverrides}
        deleteOverride={deleteOverride}
      />
    </div>
  );
}
