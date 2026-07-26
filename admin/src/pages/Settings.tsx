import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useCompanySettings, useUpdateCompanySettings, useServices } from "@/hooks/useServices";
import { Settings as SettingsIcon, MessageSquare } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();
  const { data: settings } = useCompanySettings();
  const updateSettings = useUpdateCompanySettings();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [creating, setCreating] = useState(false);

  // Oman salasanan vaihto
  const [newPw, setNewPw] = useState("");
  const [pwMsg, setPwMsg] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  async function handleChangePassword(e: React.FormEvent) {
    e.preventDefault();
    setPwMsg(""); setPwErr(""); setPwBusy(true);
    const { error } = await supabase.auth.updateUser({ password: newPw });
    if (error) setPwErr(error.message);
    else { setPwMsg("Salasana vaihdettu onnistuneesti."); setNewPw(""); }
    setPwBusy(false);
  }

  const [transitionMinutes, setTransitionMinutes] = useState("");
  const [weightDistance, setWeightDistance] = useState("40");
  const [weightWorkload, setWeightWorkload] = useState("30");
  const [weightRoute, setWeightRoute] = useState("30");
  const [settingsSaved, setSettingsSaved] = useState(false);

  // SMS review settings
  const { data: services = [] } = useServices();
  const [reviewSmsEnabled, setReviewSmsEnabled] = useState(false);
  const [reviewSmsTemplate, setReviewSmsTemplate] = useState("");
  const [reviewSmsDelay, setReviewSmsDelay] = useState("60");
  const [reviewSmsServiceIds, setReviewSmsServiceIds] = useState<string[]>([]);
  const [serviceTemplates, setServiceTemplates] = useState<Record<string, string>>({});
  const [smsSaved, setSmsSaved] = useState(false);

  useEffect(() => {
    if (settings) {
      setTransitionMinutes(String(settings.default_transition_minutes));
      setWeightDistance(String(settings.optimization_weight_distance ?? 40));
      setWeightWorkload(String(settings.optimization_weight_workload ?? 30));
      setWeightRoute(String(settings.optimization_weight_route ?? 30));
      setReviewSmsEnabled(settings.review_sms_enabled ?? false);
      setReviewSmsTemplate(settings.review_sms_template ?? "");
      setReviewSmsDelay(String(settings.review_sms_delay_minutes ?? 60));
      setReviewSmsServiceIds(settings.review_sms_service_ids ?? []);
    }
  }, [settings]);

  // Load service-specific templates
  useEffect(() => {
    if (services.length > 0) {
      const templates: Record<string, string> = {};
      for (const s of services) {
        if (s.review_sms_template) {
          templates[s.id] = s.review_sms_template;
        }
      }
      setServiceTemplates(templates);
    }
  }, [services]);

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    const val = parseInt(transitionMinutes, 10);
    if (isNaN(val) || val < 0) return;
    const wD = parseInt(weightDistance, 10) || 0;
    const wW = parseInt(weightWorkload, 10) || 0;
    const wR = parseInt(weightRoute, 10) || 0;
    await updateSettings.mutateAsync({
      default_transition_minutes: val,
      optimization_weight_distance: wD,
      optimization_weight_workload: wW,
      optimization_weight_route: wR,
    });
    setSettingsSaved(true);
    setTimeout(() => setSettingsSaved(false), 2000);
  }

  async function handleCreateAdmin(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    setError("");
    setCreating(true);

    try {
      const { error: fnError } = await supabase.functions.invoke(
        "create-admin-user",
        { body: { email, password } }
      );

      if (fnError) throw fnError;
      setMessage(`Admin-käyttäjä ${email} luotu onnistuneesti.`);
      setEmail("");
      setPassword("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Luonti epäonnistui");
    } finally {
      setCreating(false);
    }
  }

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <SettingsIcon className="w-5 h-5 text-accent" />
        <h1 className="text-xl sm:text-2xl font-bold text-text-primary">Asetukset</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Company settings */}
        <div className="bg-surface rounded-2xl border border-border p-6">
          <h2 className="font-semibold text-text-primary mb-5">Yrityksen asetukset</h2>
          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                Oletussiirtymäaika (min)
              </label>
              <input
                type="number"
                min={0}
                step={5}
                value={transitionMinutes}
                onChange={(e) => setTransitionMinutes(e.target.value)}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
              />
              <p className="text-xs text-text-muted mt-1">
                Aika joka varataan siirtymiseen asennusten välillä. Palvelukohtainen siirtymä ohittaa tämän.
              </p>
            </div>

            {/* Optimization weights */}
            <div className="pt-4 border-t border-border">
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">
                Asentajan valinnan optimointi
              </label>
              <p className="text-xs text-text-muted mb-4">
                Painoarvot määrittävät miten asentaja valitaan automaattisesti. Suurempi luku = tärkeämpi tekijä.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-text-secondary mb-1">Etäisyys</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={weightDistance}
                    onChange={(e) => setWeightDistance(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                  />
                  <p className="text-[10px] text-text-muted mt-1">Postinumeroetäisyys</p>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-text-secondary mb-1">Kuorma</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={weightWorkload}
                    onChange={(e) => setWeightWorkload(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                  />
                  <p className="text-[10px] text-text-muted mt-1">Viikkokuorma</p>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-text-secondary mb-1">Reitti</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={weightRoute}
                    onChange={(e) => setWeightRoute(e.target.value)}
                    className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                  />
                  <p className="text-[10px] text-text-muted mt-1">Saman päivän keikat</p>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={updateSettings.isPending}
              className="px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {updateSettings.isPending ? "Tallennetaan..." : settingsSaved ? "Tallennettu!" : "Tallenna"}
            </button>
          </form>
        </div>

        {/* Current user */}
        <div className="bg-surface rounded-2xl border border-border p-6">
          <h2 className="font-semibold text-text-primary mb-5">Oma tili</h2>
          <div className="text-sm space-y-4">
            <div>
              <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Sähköposti</p>
              <p className="font-medium text-text-primary">{user?.email}</p>
            </div>
            <div>
              <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Käyttäjä-ID</p>
              <p className="font-mono text-xs text-text-secondary bg-surface-alt px-3 py-2 rounded-lg">{user?.id}</p>
            </div>
          </div>
        </div>

        {/* Review SMS settings */}
        <div className="bg-surface rounded-2xl border border-border p-6 lg:col-span-2">
          <div className="flex items-center gap-2 mb-5">
            <MessageSquare className="w-4 h-4 text-accent" />
            <h2 className="font-semibold text-text-primary">Arvostelu-SMS</h2>
          </div>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              await updateSettings.mutateAsync({
                review_sms_enabled: reviewSmsEnabled,
                review_sms_template: reviewSmsTemplate,
                review_sms_delay_minutes: parseInt(reviewSmsDelay, 10) || 0,
                review_sms_service_ids: reviewSmsServiceIds,
              });
              // Save per-service templates
              for (const [serviceId, template] of Object.entries(serviceTemplates)) {
                await supabase
                  .from("services")
                  .update({ review_sms_template: template || null })
                  .eq("id", serviceId);
              }
              setSmsSaved(true);
              setTimeout(() => setSmsSaved(false), 2000);
            }}
            className="space-y-4"
          >
            {/* Enable toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                onClick={() => setReviewSmsEnabled(!reviewSmsEnabled)}
                className={`relative w-10 h-5 rounded-full transition-colors ${
                  reviewSmsEnabled ? "bg-accent" : "bg-gray-300"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                    reviewSmsEnabled ? "translate-x-5" : "translate-x-0.5"
                  }`}
                />
              </div>
              <span className="text-sm font-medium text-text-primary">
                Lähetä arvostelu-SMS viimeistelyn jälkeen
              </span>
            </label>

            <p className="text-xs text-text-muted">
              SMS lähetetään automaattisesti kun asentaja merkitsee asiakkaan tyytyväiseksi viimeistelyssä. Sama asiakas ei saa koskaan toista arvostelupyyntöä.
            </p>

            {reviewSmsEnabled && (
              <>
                {/* Template */}
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                    Viestipohja
                  </label>
                  <textarea
                    value={reviewSmsTemplate}
                    onChange={(e) => setReviewSmsTemplate(e.target.value)}
                    rows={3}
                    className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                  />
                  <p className="text-[11px] text-text-muted mt-1">
                    Muuttujat: {"{{first_name}}"}, {"{{last_name}}"}, {"{{installer_name}}"}, {"{{review_url}}"}
                  </p>
                </div>

                {/* Delay */}
                <div className="max-w-xs">
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                    Viive lähetyksen jälkeen (minuuttia)
                  </label>
                  <input
                    type="number"
                    min={0}
                    step={15}
                    value={reviewSmsDelay}
                    onChange={(e) => setReviewSmsDelay(e.target.value)}
                    className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                  />
                  <p className="text-[11px] text-text-muted mt-1">0 = lähetetään heti viimeistelyn jälkeen</p>
                </div>

                {/* Service selection */}
                <div>
                  <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                    Palvelut joista lähetetään
                  </label>
                  <div className="space-y-1.5">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reviewSmsServiceIds.length === 0}
                        onChange={() => setReviewSmsServiceIds([])}
                        className="rounded border-gray-300 text-accent focus:ring-accent"
                      />
                      <span className="text-sm text-text-primary">Kaikki palvelut</span>
                    </label>
                    {services.filter(s => s.active).map((service) => (
                      <label key={service.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={reviewSmsServiceIds.length === 0 || reviewSmsServiceIds.includes(service.id)}
                          onChange={(e) => {
                            if (reviewSmsServiceIds.length === 0) {
                              // Switching from "all" to specific: select only this one
                              setReviewSmsServiceIds([service.id]);
                            } else if (e.target.checked) {
                              setReviewSmsServiceIds([...reviewSmsServiceIds, service.id]);
                            } else {
                              const next = reviewSmsServiceIds.filter((id) => id !== service.id);
                              // If none left, go back to "all"
                              setReviewSmsServiceIds(next.length === 0 ? [] : next);
                            }
                          }}
                          className="rounded border-gray-300 text-accent focus:ring-accent"
                        />
                        <span className="text-sm text-text-primary">
                          {service.name}
                        </span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[11px] text-text-muted mt-1.5">
                    Valitse "Kaikki palvelut" tai valitse yksittäiset palvelut joista arvostelu-SMS lähetetään.
                  </p>
                </div>

                {/* Per-service templates */}
                {reviewSmsServiceIds.length > 0 && (
                  <div>
                    <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                      Palvelukohtaiset viestipohjat (valinnainen)
                    </label>
                    <p className="text-[11px] text-text-muted mb-3">
                      Jätä tyhjäksi käyttääksesi oletuspohjaa. Muuttujat: {"{{first_name}}"}, {"{{last_name}}"}, {"{{installer_name}}"}, {"{{review_url}}"}
                    </p>
                    <div className="space-y-3">
                      {services
                        .filter((s) => s.active && reviewSmsServiceIds.includes(s.id))
                        .map((service) => (
                          <div key={service.id}>
                            <label className="block text-xs font-medium text-text-secondary mb-1">
                              {service.name}
                            </label>
                            <textarea
                              value={serviceTemplates[service.id] ?? ""}
                              onChange={(e) =>
                                setServiceTemplates((prev) => ({
                                  ...prev,
                                  [service.id]: e.target.value,
                                }))
                              }
                              placeholder="Käytä oletuspohjaa"
                              rows={2}
                              className="w-full px-3 py-2 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all placeholder:text-text-muted/50"
                            />
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <button
              type="submit"
              disabled={updateSettings.isPending}
              className="px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {updateSettings.isPending ? "Tallennetaan..." : smsSaved ? "Tallennettu!" : "Tallenna SMS-asetukset"}
            </button>
          </form>
        </div>

        {/* Create admin */}
        <div className="bg-surface rounded-2xl border border-border p-6 lg:col-span-2">
          <h2 className="font-semibold text-text-primary mb-5">Luo uusi admin-käyttäjä</h2>
          <form onSubmit={handleCreateAdmin} className="space-y-4 max-w-md">
            {message && (
              <div className="bg-accent-muted border border-accent/30 rounded-xl p-3 text-sm text-accent-dark">
                {message}
              </div>
            )}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                Sähköposti
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                Salasana
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2.5 bg-brand text-white rounded-xl text-sm font-semibold hover:bg-brand-light transition-colors disabled:opacity-50"
            >
              {creating ? "Luodaan..." : "Luo käyttäjä"}
            </button>
          </form>
        </div>

        {/* Change own password */}
        <div className="bg-surface rounded-2xl border border-border p-6 lg:col-span-2">
          <h2 className="font-semibold text-text-primary mb-5">Oma salasana</h2>
          <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
            {pwMsg && (
              <div className="bg-accent-muted border border-accent/30 rounded-xl p-3 text-sm text-accent-dark">{pwMsg}</div>
            )}
            {pwErr && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{pwErr}</div>
            )}
            <div>
              <label className="block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">
                Uusi salasana
              </label>
              <input
                type="password"
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                required
                minLength={8}
                placeholder="Vähintään 8 merkkiä"
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={pwBusy || newPw.length < 8}
              className="px-5 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50"
            >
              {pwBusy ? "Vaihdetaan..." : "Vaihda salasana"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

