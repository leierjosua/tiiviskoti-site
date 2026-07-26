import { useState, useMemo, lazy, Suspense } from "react";

const ServiceAreaMap = lazy(() => import("@/components/ServiceAreaMap"));
import { useUserRole } from "@/context/UserRoleContext";
import { useConfirm } from "@/context/ConfirmContext";
import { useShiftHistory } from "@/hooks/useTimeTracking";
import type { TimeEntry } from "@/hooks/useTimeTracking";
import {
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
  useUpdateEmployee,
} from "@/hooks/useEmployees";
import {
  useServices,
  useServiceAreas,
  useCreateServiceArea,
  useUpdateServiceArea,
  useDeleteServiceArea,
} from "@/hooks/useServices";
import { useAddonServices, useAllAddonServiceLinks, useEmployeeAddonExclusions, useSetAddonExclusions } from "@/hooks/useAddonServices";
import { PostalCodePicker } from "@/components/PostalCodePicker";
import { postalCodesWithinRadius } from "@/lib/postal-distances";
import { Badge } from "@/components/ui/badge";
import { TimePicker } from "@/components/ui/TimePicker";
import { formatDate, postalCodesToCities, MONTH_NAMES_FI } from "@/lib/utils";
import {
  Save,
  Pencil,
  Plus,
  Trash2,
  MapPin,
  Calendar,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Clock,
  PartyPopper,
} from "lucide-react";
import type { InstallerCalendar, CalendarOverride } from "@/lib/types";

// Days used in calendar schedule editing are defined in sub-components


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

export default function InstallerProfile() {
  const confirm = useConfirm();
  const { employee } = useUserRole();
  const { data: empServices } = useEmployeeServices(employee?.id);
  const { data: allServices } = useServices();
  const { data: serviceAreas } = useServiceAreas(employee?.id);
  const { data: calendars } = useInstallerCalendars(employee?.id);
  const updateEmployee = useUpdateEmployee();
  const setEmpServices = useSetEmployeeServices();
  const createServiceArea = useCreateServiceArea();
  const updateServiceArea = useUpdateServiceArea();
  const deleteServiceArea = useDeleteServiceArea();
  const createCalendar = useCreateCalendar();
  const updateCalendar = useUpdateCalendar();
  const deleteCalendar = useDeleteCalendar();

  // Info editing
  const [editingInfo, setEditingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({ first_name: "", last_name: "", email: "", phone: "", postal_code: "" });

  // Service areas
  const [showAreaForm, setShowAreaForm] = useState(false);
  const [editingAreaId, setEditingAreaId] = useState<string | null>(null);
  const [areaForm, setAreaForm] = useState({ name: "", description: "", postal_codes: [] as string[], mode: "manual" as "manual" | "radius", center_postal: "", radius_km: "" });
  const [areaError, setAreaError] = useState("");

  // Calendars
  const [selectedCalendar, setSelectedCalendar] = useState<InstallerCalendar | null>(null);
  const [showCalendarForm, setShowCalendarForm] = useState(false);
  const [calForm, setCalForm] = useState({ service_ids: [] as string[], service_area_ids: [] as string[], name: "" });
  const [editingCalendarId, setEditingCalendarId] = useState<string | null>(null);
  const [editCalForm, setEditCalForm] = useState({ service_ids: [] as string[], service_area_ids: [] as string[], name: "" });

  if (!employee) return null;

  const assignedServiceIds = empServices?.map((es: { service_id: string }) => es.service_id) || [];
  const { data: allAddons } = useAddonServices();
  const { data: addonLinks } = useAllAddonServiceLinks();
  const { data: addonExclusions } = useEmployeeAddonExclusions(employee?.id);
  const setAddonExclusions = useSetAddonExclusions();

  // Only show addons linked to the installer's assigned services
  const relevantAddons = useMemo(() => {
    if (!allAddons || !addonLinks) return [];
    const assignedSet = new Set(assignedServiceIds);
    const linkedAddonIds = new Set(
      addonLinks.filter((l) => assignedSet.has(l.service_id)).map((l) => l.addon_service_id)
    );
    return allAddons.filter((a) => a.active && linkedAddonIds.has(a.id));
  }, [allAddons, addonLinks, assignedServiceIds]);

  function toggleService(serviceId: string) {
    const next = assignedServiceIds.includes(serviceId)
      ? assignedServiceIds.filter((id: string) => id !== serviceId)
      : [...assignedServiceIds, serviceId];
    setEmpServices.mutate({ employeeId: employee!.id, serviceIds: next });
  }

  function toggleAddonExclusion(addonId: string) {
    if (!addonExclusions) return;
    const current = [...addonExclusions];
    const isExcluded = addonExclusions.has(addonId);
    const next = isExcluded
      ? current.filter((id) => id !== addonId)
      : [...current, addonId];
    setAddonExclusions.mutate({ employeeId: employee!.id, excludedAddonIds: next });
  }

  async function handleCreateCalendar(ev: React.FormEvent) {
    ev.preventDefault();
    await createCalendar.mutateAsync({
      employee_id: employee!.id,
      service_ids: calForm.service_ids,
      service_area_ids: calForm.service_area_ids,
      name: calForm.name,
    });
    setShowCalendarForm(false);
    setCalForm({ service_ids: [], service_area_ids: [], name: "" });
  }

  return (
    <div>
      <h1 className="text-xl sm:text-2xl font-bold text-text-primary mb-6">Asetukset</h1>

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
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateEmployee.mutate(
                  {
                    id: employee.id,
                    first_name: infoForm.first_name.trim(),
                    last_name: infoForm.last_name.trim(),
                    phone: infoForm.phone.trim() || null,
                    postal_code: infoForm.postal_code.trim() || null,
                  },
                  { onSuccess: () => setEditingInfo(false) }
                );
              }}
              className="space-y-4"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Etunimi</label>
                  <input type="text" required value={infoForm.first_name} onChange={(e) => setInfoForm({ ...infoForm, first_name: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Sukunimi</label>
                  <input type="text" required value={infoForm.last_name} onChange={(e) => setInfoForm({ ...infoForm, last_name: e.target.value })}
                    className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Sähköposti</label>
                  <input type="email" required value={infoForm.email} disabled
                    className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface-alt text-text-muted cursor-not-allowed" />
                  <p className="text-xs text-text-muted mt-1">Ota yhteyttä ylläpitoon sähköpostin vaihtamiseksi</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Puhelin</label>
                  <input type="tel" value={infoForm.phone} onChange={(e) => setInfoForm({ ...infoForm, phone: e.target.value })} placeholder="040 1234567"
                    className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Postinumero</label>
                  <input type="text" value={infoForm.postal_code} onChange={(e) => setInfoForm({ ...infoForm, postal_code: e.target.value })} placeholder="00100"
                    className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="submit" disabled={updateEmployee.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2.5 bg-accent text-white text-sm font-semibold rounded-xl hover:bg-accent/90 transition-colors disabled:opacity-50">
                  <Save className="w-4 h-4" /> Tallenna
                </button>
                <button type="button" onClick={() => setEditingInfo(false)}
                  className="px-4 py-2.5 text-sm text-text-muted hover:text-text-primary border border-border rounded-xl transition-colors">
                  Peruuta
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Services */}
        <div className="bg-surface rounded-2xl border border-border p-6">
          <h2 className="font-semibold text-text-primary mb-4">Palvelut</h2>
          <p className="text-sm text-text-muted mb-4">Valitse mitä palveluita suoritat.</p>
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
              <p className="text-sm text-text-muted">Ei palveluita saatavilla</p>
            )}
          </div>
        </div>

        {/* Addon Services */}
        {relevantAddons.length > 0 && (
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-2">Lisäpalvelut</h2>
            <p className="text-sm text-text-muted mb-4">Oletuksena teet kaikkia lisäpalveluita. Poista valinta niistä, joita et suorita.</p>
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
        <div className="bg-surface rounded-2xl border border-border p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="font-semibold text-text-primary">Palvelualueet</h2>
            <button onClick={() => { setShowAreaForm(!showAreaForm); setEditingAreaId(null); setAreaForm({ name: "", description: "", postal_codes: [], mode: "manual", center_postal: "", radius_km: "" }); }}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-light transition-colors whitespace-nowrap w-full sm:w-auto">
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
                        onChange={(e) => setAreaForm({ ...areaForm, center_postal: e.target.value.replace(/\D/g, "").slice(0, 5) })}
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
                  <PostalCodePicker selected={areaForm.postal_codes} onChange={(codes) => setAreaForm({ ...areaForm, postal_codes: codes })} />
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

        {/* Calendars */}
        <div className="bg-surface rounded-2xl border border-border p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="font-semibold text-text-primary">Kalenterit</h2>
            <button onClick={() => setShowCalendarForm(!showCalendarForm)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-light transition-colors whitespace-nowrap w-full sm:w-auto">
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
                      <button key={s.id} type="button"
                        onClick={() => setCalForm((prev) => ({ ...prev, service_ids: selected ? prev.service_ids.filter((id) => id !== s.id) : [...prev.service_ids, s.id] }))}
                        className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${selected ? "bg-accent-muted text-accent-dark border-accent/30" : "bg-surface text-text-secondary border-border hover:border-border-strong"}`}>
                        {s.name}
                      </button>
                    );
                  })}
                  {(!allServices || allServices.filter((s) => assignedServiceIds.includes(s.id)).length === 0) && (
                    <p className="text-sm text-text-muted mt-2">Lisää ensin palveluita.</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Palvelualueet *</label>
                <div className="flex flex-wrap gap-2">
                  {serviceAreas?.map((sa) => {
                    const selected = calForm.service_area_ids.includes(sa.id);
                    return (
                      <button key={sa.id} type="button"
                        onClick={() => setCalForm((prev) => ({ ...prev, service_area_ids: selected ? prev.service_area_ids.filter((id) => id !== sa.id) : [...prev.service_area_ids, sa.id] }))}
                        className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${selected ? "bg-accent-muted text-accent-dark border-accent/30" : "bg-surface text-text-secondary border-border hover:border-border-strong"}`}>
                        {sa.name}
                      </button>
                    );
                  })}
                  {(!serviceAreas || serviceAreas.length === 0) && (
                    <p className="text-sm text-text-muted">Luo ensin palvelualue.</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Nimi *</label>
                <input type="text" required value={calForm.name} onChange={(e) => setCalForm({ ...calForm, name: e.target.value })}
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
                      selectedCalendar?.id === cal.id ? "border-accent bg-accent-muted" : "border-border hover:border-border-strong"
                    }`}
                    onClick={() => {
                      if (editingCalendarId === cal.id) return;
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
                        <button onClick={(e) => {
                          e.stopPropagation();
                          if (editingCalendarId === cal.id) {
                            setEditingCalendarId(null);
                          } else {
                            setEditingCalendarId(cal.id);
                            setEditCalForm({ service_ids: (cal.calendar_services || []).map((cs) => cs.service_id), service_area_ids: (cal.calendar_service_areas || []).map((csa) => csa.service_area_id), name: cal.name });
                          }
                        }} className="p-2 text-text-muted hover:text-text-primary rounded-lg hover:bg-surface-hover transition-all">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={async (e) => {
                          e.stopPropagation();
                          if (await confirm({ message: `Poistetaanko kalenteri "${cal.name}"?`, confirmLabel: "Poista", variant: "danger" })) {
                            if (selectedCalendar?.id === cal.id) setSelectedCalendar(null);
                            deleteCalendar.mutate(cal.id);
                          }
                        }} className="p-2 text-text-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Inline edit form */}
                  {editingCalendarId === cal.id && (
                    <div onClick={(e) => e.stopPropagation()} className="bg-surface-alt rounded-b-xl border border-t-0 border-border p-5 space-y-4 -mt-1">
                      <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Palvelut</label>
                        <div className="flex flex-wrap gap-2">
                          {allServices?.filter((s) => assignedServiceIds.includes(s.id)).map((s) => {
                            const selected = editCalForm.service_ids.includes(s.id);
                            return (
                              <button key={s.id} type="button"
                                onClick={() => setEditCalForm((prev) => ({ ...prev, service_ids: selected ? prev.service_ids.filter((id) => id !== s.id) : [...prev.service_ids, s.id] }))}
                                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${selected ? "bg-accent-muted text-accent-dark border-accent/30" : "bg-surface text-text-secondary border-border hover:border-border-strong"}`}>
                                {s.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Palvelualueet</label>
                        <div className="flex flex-wrap gap-2">
                          {serviceAreas?.map((sa) => {
                            const selected = editCalForm.service_area_ids.includes(sa.id);
                            return (
                              <button key={sa.id} type="button"
                                onClick={() => setEditCalForm((prev) => ({ ...prev, service_area_ids: selected ? prev.service_area_ids.filter((id) => id !== sa.id) : [...prev.service_area_ids, sa.id] }))}
                                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${selected ? "bg-accent-muted text-accent-dark border-accent/30" : "bg-surface text-text-secondary border-border hover:border-border-strong"}`}>
                                {sa.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Nimi</label>
                        <input type="text" required value={editCalForm.name} onChange={(e) => setEditCalForm({ ...editCalForm, name: e.target.value })}
                          className="w-full max-w-sm px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
                      </div>
                      <div className="flex gap-3">
                        <button type="button" disabled={updateCalendar.isPending || editCalForm.service_ids.length === 0 || editCalForm.service_area_ids.length === 0}
                          onClick={async () => {
                            await updateCalendar.mutateAsync({ id: cal.id, service_ids: editCalForm.service_ids, service_area_ids: editCalForm.service_area_ids, name: editCalForm.name });
                            setEditingCalendarId(null);
                            if (selectedCalendar?.id === cal.id) setSelectedCalendar(null);
                          }}
                          className="px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50">
                          Tallenna
                        </button>
                        <button type="button" onClick={() => setEditingCalendarId(null)}
                          className="px-5 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors">
                          Peruuta
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Calendar Schedule Editor */}
        {selectedCalendar && (
          <CalendarScheduleEditor calendar={selectedCalendar} />
        )}

        {/* Työtunnit */}
        {employee.tier === "palkallinen" && <ShiftHistory employeeId={employee.id} tier={employee.tier} />}

      </div>
    </div>
  );
}

/* ─── Calendar Schedule Editor (same as admin) ─── */

const DAYS = [
  { num: 1, short: "Ma" }, { num: 2, short: "Ti" }, { num: 3, short: "Ke" },
  { num: 4, short: "To" }, { num: 5, short: "Pe" }, { num: 6, short: "La" }, { num: 7, short: "Su" },
];

function CalendarScheduleEditor({ calendar }: { calendar: InstallerCalendar }) {
  const { data: weeklySlots } = useWeeklySlots(calendar.id);
  const setWeekly = useSetWeeklySlots();
  const { data: overrides } = useCalendarOverrides(calendar.id);
  const createOverride = useCreateOverride();
  const deleteOverride = useDeleteOverride();

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
      const next = current.filter((s) => s.day_of_week !== day);
      setWeekly.mutate({ calendarId: calendar.id, slots: next.map((s) => ({ day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time })) });
    } else {
      const next = [...current, { day_of_week: day, start_time: "08:00", end_time: "16:00" }];
      setWeekly.mutate({ calendarId: calendar.id, slots: next.map((s) => ({ day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time })) });
    }
  }

  function updateDayTime(day: number, field: "start_time" | "end_time", value: string) {
    const current = weeklySlots || [];
    const others = current.filter((s) => s.day_of_week !== day);
    const existing = slotsByDay[day] || { start_time: "08:00", end_time: "16:00" };
    const updated = { ...existing, [field]: value };
    if (updated.start_time >= updated.end_time) return;
    const next = [...others, { day_of_week: day, start_time: updated.start_time, end_time: updated.end_time }];
    setWeekly.mutate({ calendarId: calendar.id, slots: next.map((s) => ({ day_of_week: s.day_of_week, start_time: s.start_time, end_time: s.end_time })) });
  }

  const availableOverrides = overrides?.filter((o) => o.override_type === "available") || [];
  const allBlocked = overrides?.filter((o) => o.override_type === "blocked") || [];
  const holidayOverrides = allBlocked.filter((o) => o.reason && FINNISH_HOLIDAY_NAMES.has(o.reason));
  const blockedOverrides = allBlocked.filter((o) => !o.reason || !FINNISH_HOLIDAY_NAMES.has(o.reason));

  return (
    <div className="bg-surface rounded-2xl border border-border p-6 space-y-8">
      {/* Weekly availability */}
      <div>
        <div className="flex items-center gap-3 mb-5">
          <Calendar className="w-5 h-5 text-accent-dark" />
          <h2 className="font-semibold text-text-primary">Viikottainen saatavuus</h2>
        </div>

        <div className="flex flex-wrap gap-2 mb-5">
          {DAYS.map((d) => (
            <button key={d.num} onClick={() => toggleDay(d.num)}
              className={`w-10 h-10 rounded-full text-sm font-semibold transition-all ${
                activeDays.has(d.num)
                  ? "bg-accent text-white"
                  : "bg-surface-alt text-text-muted border border-border hover:border-accent/50"
              }`}>
              {d.short}
            </button>
          ))}
        </div>

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
                <button onClick={() => toggleDay(d.num)} className="p-2 text-text-muted hover:text-red-600 rounded-lg hover:bg-red-50 transition-all">
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
      <OverrideSection calendarId={calendar.id} overrides={availableOverrides} type="available" createOverride={createOverride} deleteOverride={deleteOverride} />

      {/* Blocked days */}
      <OverrideSection calendarId={calendar.id} overrides={blockedOverrides} type="blocked" createOverride={createOverride} deleteOverride={deleteOverride} />

      {/* Finnish public holidays */}
      <HolidaySection holidays={holidayOverrides} deleteOverride={deleteOverride} />
    </div>
  );
}

/* ─── Holiday Section ─── */

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

/* ─── Override Section ─── */

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
    if (calMonth === 0) { setCalYear(calYear - 1); setCalMonth(11); } else setCalMonth(calMonth - 1);
  }
  function nextMonth() {
    if (calMonth === 11) { setCalYear(calYear + 1); setCalMonth(0); } else setCalMonth(calMonth + 1);
  }

  function handleDateClick(dateKey: string) {
    setSelectedDates((prev) => { const next = new Set(prev); if (next.has(dateKey)) next.delete(dateKey); else next.add(dateKey); return next; });
  }

  function removeDate(dateKey: string) {
    setSelectedDates((prev) => { const next = new Set(prev); next.delete(dateKey); return next; });
  }

  async function handleAdd() {
    if (selectedDates.size === 0) return;
    const datesToAdd = [...selectedDates].filter((d) => !overrideDates.has(d));
    for (const date of datesToAdd) {
      await createOverride.mutateAsync({
        calendar_id: calendarId, date, start_time: startTime || null, end_time: endTime || null, override_type: type, reason: reason || undefined,
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
  const btnCls = isBlocked ? "bg-red-500 hover:bg-red-600 text-white" : "bg-accent hover:bg-accent-dark text-white";

  const newDates = [...selectedDates].filter((d) => !overrideDates.has(d)).sort();
  const existingSelected = [...selectedDates].filter((d) => overrideDates.has(d)).sort();

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <Calendar className={`w-5 h-5 flex-shrink-0 ${isBlocked ? "text-red-500" : "text-accent-dark"}`} />
          <h2 className="font-semibold text-text-primary">
            {isBlocked ? "Estetyt ajat" : "Lisäsaatavuus"}{" "}
            <span className="text-text-muted font-normal">({overrides.length})</span>
          </h2>
        </div>
        <button onClick={() => expanded ? handleClose() : setExpanded(true)}
          className={`inline-flex items-center justify-center gap-2 px-4 py-2 border rounded-xl text-sm font-semibold transition-colors whitespace-nowrap ${
            isBlocked ? "border-red-200 text-red-600 hover:bg-red-50" : "border-accent text-accent-dark hover:bg-accent-muted"
          }`}>
          {expanded ? <><X className="w-4 h-4" /> Sulje</> : <><Plus className="w-4 h-4" /> Hallinnoi aikoja</>}
        </button>
      </div>

      {overrides.length > 0 && (
        <div className="space-y-2">
          {overrides.sort((a, b) => a.date.localeCompare(b.date)).map((o) => (
            <div key={o.id} className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3 p-3 rounded-xl ${accentBg} border ${accentBorder}`}>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
                <span className="text-sm font-medium text-text-primary whitespace-nowrap">{formatDate(o.date)}</span>
                <Badge className={badgeCls}>
                  {o.start_time ? `${normalizeTime(o.start_time)}${o.end_time ? ` – ${normalizeTime(o.end_time)}` : ""}` : "Koko päivä"}
                </Badge>
                {o.reason && <span className="text-xs text-text-muted truncate">{o.reason}</span>}
              </div>
              <button onClick={() => deleteOverride.mutate(o.id)}
                className={`p-2 rounded-lg transition-all flex-shrink-0 self-end sm:self-auto ${isBlocked ? "text-red-400 hover:text-red-600 hover:bg-red-100" : "text-text-muted hover:text-red-600 hover:bg-red-50"}`}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {overrides.length === 0 && !expanded && (
        <p className="text-sm text-text-muted py-2">{isBlocked ? "Ei estettyjä aikoja" : "Ei lisäsaatavuuksia"}</p>
      )}

      {expanded && (
        <div className="bg-surface-alt rounded-xl border border-border p-5 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Mini calendar */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="p-1.5 hover:bg-surface-hover rounded-lg transition-colors">
                  <ChevronLeft className="w-4 h-4 text-text-secondary" />
                </button>
                <span className="text-sm font-semibold text-text-primary">{MINI_MONTHS[calMonth]} {calYear}</span>
                <button onClick={nextMonth} className="p-1.5 hover:bg-surface-hover rounded-lg transition-colors">
                  <ChevronRight className="w-4 h-4 text-text-secondary" />
                </button>
              </div>
              <div className="grid grid-cols-7 mb-1">
                {MINI_WEEKDAYS.map((d) => (
                  <div key={d} className="text-center text-[10px] font-semibold text-text-muted uppercase py-1">{d}</div>
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
                    <button key={dateKey} onClick={() => !isPast && handleDateClick(dateKey)} disabled={isPast}
                      className={`aspect-square rounded-lg text-xs font-medium flex flex-col items-center justify-center relative transition-all ${
                        isPast ? "text-text-muted/30 cursor-not-allowed"
                        : isSelected ? `${accentRing} ring-2 shadow-sm`
                        : hasOverride ? `${accentBg} ${isBlocked ? "text-red-600" : "text-accent-dark"} font-semibold`
                        : "hover:bg-surface-hover text-text-primary"
                      } ${isToday && !isSelected ? "font-bold" : ""}`}>
                      {day}
                      {hasOverride && !isSelected && <span className={`absolute bottom-0.5 w-1 h-1 rounded-full ${accentDot}`} />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right side */}
            <div className="space-y-4">
              {selectedDates.size > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-text-muted uppercase tracking-wide">
                      {selectedDates.size} {selectedDates.size === 1 ? "päivä" : "päivää"} valittu
                    </span>
                    <button onClick={() => setSelectedDates(new Set())} className="text-xs text-text-muted hover:text-text-primary transition-colors">Tyhjennä</button>
                  </div>
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

                  {newDates.length > 0 && (
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
                        <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
                          placeholder={isBlocked ? "esim. Loma, sairaus..." : "esim. Ylimääräinen vuoro..."}
                          className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent" />
                      </div>
                      <button onClick={handleAdd} disabled={createOverride.isPending}
                        className={`w-full px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 ${btnCls}`}>
                        {isBlocked ? "Estä" : "Lisää saatavuus"} ({newDates.length} {newDates.length === 1 ? "päivä" : "päivää"})
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

function formatShiftDuration(entry: TimeEntry): string {
  if (!entry.clock_out) return "käynnissä";
  const ms = new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime();
  const totalMin = Math.max(0, Math.round(ms / 60_000) - entry.break_minutes);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}min`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Helsinki" });
}

function ShiftHistory({ employeeId, tier }: { employeeId: string; tier: string | null }) {
  if (tier !== "palkallinen") return null;
  const now = new Date();
  const [monthOffset, setMonthOffset] = useState(0);

  const month = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }, [monthOffset]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map(Number);
    return `${MINI_MONTHS[m - 1]} ${y}`;
  }, [month]);

  const { data: shifts, isLoading } = useShiftHistory(employeeId, month);

  const totalMinutes = useMemo(() => {
    if (!shifts) return 0;
    return shifts.reduce((sum, entry) => {
      if (!entry.clock_out) return sum;
      const ms = new Date(entry.clock_out).getTime() - new Date(entry.clock_in).getTime();
      return sum + Math.max(0, Math.round(ms / 60_000) - entry.break_minutes);
    }, 0);
  }, [shifts]);

  const totalH = Math.floor(totalMinutes / 60);
  const totalM = totalMinutes % 60;

  return (
    <div className="bg-surface rounded-2xl border border-border p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-text-muted" />
          <h2 className="font-semibold text-text-primary">Työtunnit</h2>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMonthOffset((p) => p - 1)} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
            <ChevronLeft className="w-4 h-4 text-text-muted" />
          </button>
          <span className="text-sm font-medium text-text-primary min-w-[120px] text-center">{monthLabel}</span>
          <button onClick={() => setMonthOffset((p) => Math.min(p + 1, 0))} disabled={monthOffset >= 0}
            className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors disabled:opacity-30">
            <ChevronRight className="w-4 h-4 text-text-muted" />
          </button>
        </div>
      </div>

      {/* Total */}
      <div className="bg-surface-alt rounded-xl px-4 py-3 mb-4 flex items-center justify-between">
        <span className="text-sm text-text-muted">Yhteensä</span>
        <span className="text-lg font-bold text-text-primary tabular-nums">{totalH}h {String(totalM).padStart(2, "0")}min</span>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-surface-alt rounded-xl animate-pulse" />)}
        </div>
      ) : !shifts || shifts.length === 0 ? (
        <p className="text-sm text-text-muted text-center py-6">Ei kirjauksia</p>
      ) : (
        <div className="space-y-1.5">
          {shifts.map((entry) => {
            const dateStr = new Date(entry.clock_in).toLocaleDateString("fi-FI", { weekday: "short", day: "numeric", month: "numeric", timeZone: "Europe/Helsinki" });
            return (
              <div key={entry.id} className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-3 px-3 py-2.5 rounded-xl hover:bg-surface-hover transition-colors">
                <span className="text-sm font-medium text-text-primary sm:w-20 capitalize">{dateStr}</span>
                <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
                  <span className="text-sm text-text-secondary tabular-nums">
                    {formatTime(entry.clock_in)} – {entry.clock_out ? formatTime(entry.clock_out) : "..."}
                  </span>
                  {entry.break_minutes > 0 && (
                    <span className="text-xs text-text-muted whitespace-nowrap">({entry.break_minutes} min tauko)</span>
                  )}
                  <span className="ml-auto text-sm font-semibold text-text-primary tabular-nums whitespace-nowrap">
                    {formatShiftDuration(entry)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
