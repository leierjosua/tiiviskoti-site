import { useState, useMemo } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, Check, Search } from "lucide-react";
import {
  useContractTemplates,
  useCreateContract,
  useCreateContractVisits,
} from "@/hooks/useContracts";
import { useCustomers } from "@/hooks/useCustomers";
import {
  formatCents,
  FREQUENCY_LABELS,
  getTierUnitPrices,
} from "@/lib/utils";
import type { Customer, ContractTemplate, ContractDurationTier } from "@/lib/types";

function templateTiers(t: ContractTemplate): ContractDurationTier[] {
  return Array.isArray(t.duration_tiers) && t.duration_tiers.length > 0
    ? [...t.duration_tiers].sort((a, b) => a.months - b.months)
    : [{
        months: t.duration_months,
        contract_price_cents: t.contract_price_cents,
        regular_price_cents: t.regular_price_cents,
      }];
}

function monthsLabel(m: number) {
  return m % 12 === 0 ? `${m / 12} v` : `${m} kk`;
}

type Step = 0 | 1 | 2 | 3;

export default function CreateContract() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const renewContractId = searchParams.get("renew");

  const { data: templates } = useContractTemplates();
  const { data: allCustomers } = useCustomers();
  const createContract = useCreateContract();
  const createVisits = useCreateContractVisits();

  const [step, setStep] = useState<Step>(0);
  const [selectedTemplate, setSelectedTemplate] = useState<ContractTemplate | null>(null);
  const [selectedTier, setSelectedTier] = useState<ContractDurationTier | null>(null);
  const [deviceCount, setDeviceCount] = useState<number>(1);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");

  // Step 3 form
  const [serviceAddress, setServiceAddress] = useState("");
  const [servicePostalCode, setServicePostalCode] = useState("");
  const [autoRenew, setAutoRenew] = useState(true);
  const [notes, setNotes] = useState("");
  const [submitError, setSubmitError] = useState("");

  const unitPrices = (selectedTier && deviceCount > 0)
    ? getTierUnitPrices(selectedTier, deviceCount)
    : null;
  const totalContractCents = unitPrices ? unitPrices.contract_price_cents * deviceCount : 0;
  const totalRegularCents = unitPrices ? unitPrices.regular_price_cents * deviceCount : 0;

  const activeTemplates = useMemo(
    () => (templates || []).filter((t) => t.active),
    [templates]
  );

  const filteredCustomers = useMemo(() => {
    if (!allCustomers) return [];
    if (!customerSearch) return allCustomers.slice(0, 20);
    const q = customerSearch.toLowerCase();
    return allCustomers
      .filter(
        (c) =>
          c.first_name.toLowerCase().includes(q) ||
          c.last_name.toLowerCase().includes(q) ||
          c.email.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [allCustomers, customerSearch]);

  function handleSelectTemplate(t: ContractTemplate) {
    const tiers = templateTiers(t);
    setSelectedTemplate(t);
    setDeviceCount(t.device_count || 1);
    if (tiers.length === 1) {
      setSelectedTier(tiers[0]);
    } else {
      setSelectedTier(null);
    }
  }

  function handleSelectTier(tier: ContractDurationTier) {
    setSelectedTier(tier);
  }

  function handleSelectCustomer(c: Customer) {
    setSelectedCustomer(c);
    setServiceAddress(c.address || "");
    setServicePostalCode(c.postal_code || "");
    setStep(2);
  }

  async function handleSubmit(action: "draft" | "active") {
    if (!selectedTemplate || !selectedCustomer || !selectedTier || deviceCount < 1) return;
    setSubmitError("");

    const durationMonths = selectedTier.months;
    const startDate = new Date();
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + durationMonths);

    try {
      const result = await createContract.mutateAsync({
        template_id: selectedTemplate.id,
        customer_id: selectedCustomer.id,
        service_id: selectedTemplate.service_id,
        frequency: selectedTemplate.frequency,
        visit_months: selectedTemplate.visit_months,
        visit_interval_months: selectedTemplate.visit_interval_months,
        billing_interval_months: selectedTemplate.billing_interval_months,
        contract_price_cents: totalContractCents,
        duration_months: durationMonths,
        device_count: deviceCount,
        service_address: serviceAddress,
        service_postal_code: servicePostalCode,
        start_date: startDate.toISOString().split("T")[0],
        end_date: endDate.toISOString().split("T")[0],
        auto_renew: autoRenew,
        cancellation_notice_days: selectedTemplate.cancellation_notice_days,
        status: action === "active" ? "active" : "draft",
        signature_method: action === "active" ? "admin" : undefined,
        signed_by_name: action === "active" ? "Admin" : undefined,
        previous_contract_id: renewContractId || undefined,
        notes: notes || undefined,
      } as any);

      // Create visits based on frequency
      const visits: any[] = [];
      const startYear = startDate.getFullYear();
      const startMonth = startDate.getMonth() + 1;
      const endYear = endDate.getFullYear();
      const endMonth = endDate.getMonth() + 1;

      if (selectedTemplate.frequency === "custom") {
        // Custom: visit_months distributed once across the full contract period
        // Calculate the midpoint of the contract for scheduling
        const midDate = new Date(startDate.getTime() + (endDate.getTime() - startDate.getTime()) / 2);
        for (const month of selectedTemplate.visit_months) {
          // Schedule each visit_month in the year closest to the midpoint
          let bestYear = midDate.getFullYear();
          // Ensure it falls within contract period
          if (bestYear === startYear && month < startMonth) bestYear++;
          if (bestYear === endYear && month > endMonth) bestYear--;
          if (bestYear >= startYear && bestYear <= endYear) {
            visits.push({
              contract_id: result.id,
              scheduled_month: month,
              scheduled_year: bestYear,
            });
          }
        }
      } else {
        // once_yearly / twice_yearly: visit_months repeat every year
        for (let year = startYear; year <= endYear; year++) {
          for (const month of selectedTemplate.visit_months) {
            if (year === startYear && month < startMonth) continue;
            if (year === endYear && month > endMonth) continue;
            visits.push({
              contract_id: result.id,
              scheduled_month: month,
              scheduled_year: year,
            });
          }
        }
      }

      if (visits.length > 0) {
        await createVisits.mutateAsync(visits);
      }

      navigate(`/sopimukset/${result.contract_number}`);
    } catch (err: any) {
      setSubmitError(err.message || "Virhe sopimuksen luonnissa");
    }
  }

  const stepLabels = ["Malli", "Asiakas", "Tiedot", "Vahvista"];

  return (
    <div>
      <Link
        to="/sopimukset"
        className="inline-flex items-center gap-2 text-sm text-text-muted hover:text-text-primary transition-colors mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Takaisin
      </Link>

      <h1 className="text-xl sm:text-2xl font-bold text-text-primary mb-2">
        {renewContractId ? "Uusi sopimus" : "Luo sopimus"}
      </h1>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-8 overflow-x-auto pb-1">
        {stepLabels.map((label, i) => (
          <div key={label} className="flex items-center gap-2 flex-shrink-0">
            {i > 0 && <div className="w-8 h-px bg-border" />}
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all whitespace-nowrap ${
                step === i
                  ? "bg-brand text-white"
                  : step > i
                  ? "bg-accent-muted text-accent-dark"
                  : "bg-surface text-text-muted border border-border"
              }`}
            >
              {step > i && <Check className="w-3 h-3" />}
              {label}
            </div>
          </div>
        ))}
      </div>

      {/* Step 0 — Template selection */}
      {step === 0 && (
        <div className="space-y-4">
          <p className="text-sm text-text-muted mb-4">Valitse sopimusmalli</p>
          {activeTemplates.length === 0 ? (
            <div className="bg-surface rounded-2xl border border-border p-8 text-center">
              <p className="text-text-muted mb-3">Ei sopimusmalleja</p>
              <Link
                to="/sopimukset/mallit"
                className="text-sm text-accent-dark hover:underline"
              >
                Luo ensimmäinen malli
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {activeTemplates.map((t) => {
                const tiers = templateTiers(t);
                const defaultTier = tiers[0];
                const savings = defaultTier.regular_price_cents - defaultTier.contract_price_cents;
                const savingsPercent = defaultTier.regular_price_cents > 0
                  ? Math.round((savings / defaultTier.regular_price_cents) * 100)
                  : 0;
                const isSelected = selectedTemplate?.id === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTemplate(t)}
                    className={`p-6 bg-surface rounded-2xl border-2 transition-all text-left ${
                      isSelected ? "border-accent" : "border-border hover:border-accent"
                    }`}
                  >
                    <h3 className="font-semibold text-text-primary mb-1">{t.name}</h3>
                    {t.description && (
                      <p className="text-sm text-text-muted mb-3">{t.description}</p>
                    )}
                    <div className="flex items-baseline gap-2 mb-2">
                      <span className="text-2xl font-bold text-accent-dark">
                        {formatCents(defaultTier.contract_price_cents)}
                      </span>
                      <span className="text-sm text-text-muted line-through">
                        {formatCents(defaultTier.regular_price_cents)}
                      </span>
                    </div>
                    {savings > 0 && (
                      <p className="text-sm text-accent-dark font-semibold mb-3">
                        Säästö {formatCents(savings)} ({savingsPercent}%)
                      </p>
                    )}
                    <p className="text-xs text-text-muted">
                      {t.visit_interval_months ? `${t.visit_interval_months >= 12 ? (t.visit_interval_months === 12 ? "Kerran vuodessa" : `${t.visit_interval_months / 12} vuoden välein`) : `${t.visit_interval_months} kk välein`}` : FREQUENCY_LABELS[t.frequency]}
                      {tiers.length > 1 && ` · ${tiers.length} kestoa`}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {/* Tier picker (shown when template has >1 tier) */}
          {selectedTemplate && templateTiers(selectedTemplate).length > 1 && (
            <div className="bg-surface rounded-2xl border border-border p-5">
              <p className="text-sm font-semibold text-text-primary mb-1">
                Valitse sopimuskauden pituus
              </p>
              <p className="text-xs text-text-muted mb-4">
                {selectedTemplate.name}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {templateTiers(selectedTemplate).map((tier) => {
                  const tierSavings = tier.regular_price_cents - tier.contract_price_cents;
                  const isActive = selectedTier?.months === tier.months;
                  return (
                    <button
                      key={tier.months}
                      onClick={() => handleSelectTier(tier)}
                      className={`p-4 bg-surface rounded-xl border-2 transition-all text-left ${
                        isActive ? "border-accent" : "border-border hover:border-accent"
                      }`}
                    >
                      <p className="text-xs text-text-muted uppercase tracking-wide mb-1">
                        {monthsLabel(tier.months)}
                      </p>
                      <p className="text-xl font-bold text-accent-dark">
                        {formatCents(tier.contract_price_cents)}
                        <span className="text-xs font-normal text-text-muted"> /laite</span>
                      </p>
                      {tierSavings > 0 && (
                        <p className="text-xs text-accent-dark mt-1">
                          Säästö {formatCents(tierSavings)} /laite
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Device count + total — shown once tier selected */}
          {selectedTemplate && selectedTier && unitPrices && (
            <div className="bg-surface rounded-2xl border border-border p-5">
              <p className="text-sm font-semibold text-text-primary mb-3">Laitemäärä</p>
              <div className="flex items-center gap-3 mb-4">
                <button
                  type="button"
                  onClick={() => setDeviceCount(Math.max(1, deviceCount - 1))}
                  disabled={deviceCount <= 1}
                  className="w-9 h-9 rounded-lg border border-border text-text-primary hover:bg-surface-hover transition-colors disabled:opacity-30"
                >
                  −
                </button>
                <input
                  type="number"
                  min={1}
                  value={deviceCount}
                  onChange={(e) => setDeviceCount(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-20 text-center px-3 py-2 border border-border rounded-lg bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
                />
                <button
                  type="button"
                  onClick={() => setDeviceCount(deviceCount + 1)}
                  className="w-9 h-9 rounded-lg border border-border text-text-primary hover:bg-surface-hover transition-colors"
                >
                  +
                </button>
                <span className="text-sm text-text-muted">kpl</span>
              </div>

              <div className="bg-accent-muted/40 rounded-xl p-4 flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-xs text-text-muted mb-1">
                    {formatCents(unitPrices.contract_price_cents)} × {deviceCount} laitetta
                    {unitPrices.contract_price_cents !== selectedTier.contract_price_cents && (
                      <span className="ml-1 text-accent-dark">(volyymihinta)</span>
                    )}
                  </p>
                  <p className="text-xs text-text-muted">{monthsLabel(selectedTier.months)} sopimuskausi</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-text-muted uppercase tracking-wide">Sopimushinta</p>
                  <p className="text-2xl font-bold text-accent-dark">{formatCents(totalContractCents)}</p>
                  {totalRegularCents > totalContractCents && (
                    <p className="text-xs text-text-muted line-through">{formatCents(totalRegularCents)}</p>
                  )}
                </div>
              </div>

              <button
                onClick={() => setStep(1)}
                className="mt-4 w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-light transition-colors"
              >
                Jatka asiakkaan valintaan
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 1 — Customer selection */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-text-muted mb-2">Valitse asiakas</p>
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              type="text"
              placeholder="Hae nimellä tai sähköpostilla..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="w-full sm:max-w-md pl-10 pr-4 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              autoFocus
            />
          </div>

          <div className="bg-surface rounded-2xl border border-border divide-y divide-border max-h-96 overflow-y-auto">
            {filteredCustomers.map((c) => (
              <button
                key={c.id}
                onClick={() => handleSelectCustomer(c)}
                className="w-full flex items-center justify-between px-5 py-3.5 hover:bg-surface-hover transition-colors text-left"
              >
                <div>
                  <p className="font-medium text-sm text-text-primary">
                    {c.first_name} {c.last_name}
                  </p>
                  <p className="text-xs text-text-muted">{c.email}</p>
                </div>
                {c.address && (
                  <p className="text-xs text-text-muted hidden sm:block">{c.address}</p>
                )}
              </button>
            ))}
            {filteredCustomers.length === 0 && (
              <p className="px-5 py-8 text-center text-sm text-text-muted">Ei tuloksia</p>
            )}
          </div>

          <button
            onClick={() => setStep(0)}
            className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-border text-text-secondary hover:bg-surface-hover transition-colors"
          >
            Takaisin
          </button>
        </div>
      )}

      {/* Step 2 — Details */}
      {step === 2 && selectedTemplate && selectedCustomer && (
        <div className="space-y-6">
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-4">Sopimuksen tiedot</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
                  Kohteen osoite
                </label>
                <input
                  type="text"
                  value={serviceAddress}
                  onChange={(e) => setServiceAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
                  Postinumero
                </label>
                <input
                  type="text"
                  value={servicePostalCode}
                  onChange={(e) => setServicePostalCode(e.target.value)}
                  className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                />
              </div>
            </div>

            <div className="mt-4">
              <label className="flex items-center gap-3 cursor-pointer">
                <div
                  className={`w-10 h-6 rounded-full transition-colors relative ${
                    autoRenew ? "bg-accent" : "bg-border"
                  }`}
                  onClick={() => setAutoRenew(!autoRenew)}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                      autoRenew ? "translate-x-4.5" : "translate-x-0.5"
                    }`}
                  />
                </div>
                <span className="text-sm font-medium text-text-primary">
                  Automaattinen uusinta
                </span>
              </label>
            </div>

            <div className="mt-4">
              <label className="block text-xs font-medium text-text-muted uppercase tracking-wide mb-1.5">
                Muistiinpanot
              </label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none"
              />
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-border text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Takaisin
            </button>
            <button
              onClick={() => setStep(3)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold bg-brand text-white hover:bg-brand-light transition-colors"
            >
              Jatka
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Confirmation */}
      {step === 3 && selectedTemplate && selectedCustomer && (
        <div className="space-y-6">
          <div className="bg-surface rounded-2xl border border-border p-6">
            <h2 className="font-semibold text-text-primary mb-4">Yhteenveto</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Asiakas</p>
                <p className="font-medium text-text-primary">
                  {selectedCustomer.first_name} {selectedCustomer.last_name}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Sopimusmalli</p>
                <p className="font-medium text-text-primary">{selectedTemplate.name}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Palvelu</p>
                <p className="font-medium text-text-primary">{selectedTemplate.services?.name || "–"}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Tiheys</p>
                <p className="font-medium text-text-primary">{FREQUENCY_LABELS[selectedTemplate.frequency]}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Kohde</p>
                <p className="font-medium text-text-primary">{serviceAddress}, {servicePostalCode}</p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Kausi</p>
                <p className="font-medium text-text-primary">
                  {selectedTier ? monthsLabel(selectedTier.months) : "–"}
                </p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Laitteet</p>
                <p className="font-medium text-text-primary">{deviceCount} kpl</p>
              </div>
              <div>
                <p className="text-text-muted text-xs uppercase tracking-wide mb-1">Hinta</p>
                <p className="font-bold text-xl text-accent-dark">
                  {formatCents(totalContractCents)}
                </p>
                {unitPrices && deviceCount > 1 && (
                  <p className="text-xs text-text-muted">
                    {formatCents(unitPrices.contract_price_cents)} × {deviceCount}
                  </p>
                )}
              </div>
            </div>
          </div>

          {submitError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-4 py-3">
              {submitError}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => setStep(2)}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-border text-text-secondary hover:bg-surface-hover transition-colors"
            >
              Takaisin
            </button>
            <button
              onClick={() => handleSubmit("draft")}
              disabled={createContract.isPending}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-border text-text-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
            >
              Tallenna luonnoksena
            </button>
            <button
              onClick={() => handleSubmit("active")}
              disabled={createContract.isPending}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-accent hover:bg-accent-dark text-white transition-colors disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              Luo aktiivisena
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
