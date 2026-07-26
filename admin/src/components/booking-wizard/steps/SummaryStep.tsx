import { formatCents, getUnitPriceCents, formatAddress } from "@/lib/utils";
import { inputCls } from "@/lib/constants";
import type { ExtraItem, AddonService, Service, ServiceVariant } from "@/lib/types";
import type { LeadSourceOption, CustomerFormData, PricingResult } from "../types";

const labelCls = "block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2";

interface SummaryStepProps {
  // Services data
  selectedServices: Service[];
  serviceQty: Record<string, number>;
  selectedVariant: ServiceVariant | null;
  selectedAddonList: AddonService[];
  selectedAddons: Record<string, number>;
  selectedProductList: { id: string; name: string; price_cents: number; brand?: string | null }[];
  selectedProducts: Record<string, number>;
  parsedExtras: ExtraItem[];
  // Time/employee
  selectedDate: string | null;
  selectedTime: string | null;
  employeeName: string;
  secondaryNames?: string[];
  // Customer
  customerForm: CustomerFormData;
  // Notes
  notes: string;
  setNotes: (v: string) => void;
  // Lead source
  leadSources: LeadSourceOption[];
  leadSource: string;
  setLeadSource: (v: string) => void;
  // Discount
  discountCode: string;
  setDiscountCode: (v: string) => void;
  discountValid: boolean;
  setDiscountValid: (v: boolean) => void;
  discountError: string;
  setDiscountError: (v: string) => void;
  manualDiscountCents: string;
  setManualDiscountCents: (v: string) => void;
  onValidateDiscount: () => void;
  // Pricing
  pricing: PricingResult;
  // Notifications
  sendConfirmation?: boolean;
  setSendConfirmation?: (v: boolean) => void;
  // Submit
  submitError: string;
  isSubmitting: boolean;
  canSubmit: boolean;
  onSubmit: () => void;
  submitLabel?: string;
  submittingLabel?: string;
  // Navigation
  onBack: () => void;
  // Show kotitalousvahennys
  showLaborPortion?: boolean;
}

export function SummaryStep({
  selectedServices, serviceQty, selectedVariant,
  selectedAddonList, selectedAddons,
  selectedProductList, selectedProducts,
  parsedExtras,
  selectedDate, selectedTime,
  employeeName, secondaryNames,
  customerForm,
  notes, setNotes,
  leadSources, leadSource, setLeadSource,
  discountCode, setDiscountCode, discountValid, setDiscountValid, discountError, setDiscountError,
  manualDiscountCents, setManualDiscountCents, onValidateDiscount,
  pricing,
  sendConfirmation, setSendConfirmation,
  submitError, isSubmitting, canSubmit, onSubmit,
  submitLabel = "Luo varaus",
  submittingLabel = "Luodaan...",
  onBack,
  showLaborPortion = true,
}: SummaryStepProps) {
  return (
    <div className="max-w-2xl space-y-6">
      {/* Services summary */}
      <div className="bg-surface rounded-2xl border border-border p-5 space-y-3">
        <h3 className="font-semibold text-text-primary text-sm">Palvelut</h3>
        {selectedServices.map((s) => {
          const qty = serviceQty[s.id] || 1;
          return (
            <div key={s.id} className="flex justify-between text-sm">
              <span className="text-text-secondary">
                {selectedVariant ? `${s.name} — ${selectedVariant.label}` : s.name}
                {qty > 1 && ` × ${qty}`}
              </span>
              <span className="font-medium text-text-primary">
                {formatCents(selectedVariant ? selectedVariant.price_cents * qty : getUnitPriceCents(s, qty) * qty)}
              </span>
            </div>
          );
        })}
        {selectedAddonList.map((a) => (
          <div key={a.id} className="flex justify-between text-sm">
            <span className="text-text-secondary">{a.name}{(selectedAddons[a.id] || 1) > 1 && ` × ${selectedAddons[a.id]}`}</span>
            <span className="font-medium text-text-primary">{formatCents(a.price_cents * (selectedAddons[a.id] || 1))}</span>
          </div>
        ))}
        {selectedProductList.map((p: any) => (
          <div key={p.id} className="flex justify-between text-sm">
            <span className="text-text-secondary">{p.brand ? `${p.brand} ` : ""}{p.name}{(selectedProducts[p.id] || 1) > 1 && ` × ${selectedProducts[p.id]}`}</span>
            <span className="font-medium text-text-primary">{formatCents(p.price_cents * (selectedProducts[p.id] || 1))}</span>
          </div>
        ))}
        {parsedExtras.map((e, i) => (
          <div key={`extra-${i}`} className="flex justify-between text-sm">
            <span className="text-text-secondary">{e.name}</span>
            <span className="font-medium text-text-primary">{formatCents(e.price_cents)}</span>
          </div>
        ))}
      </div>

      {/* Time & employee */}
      {selectedDate && selectedTime && (
        <div className="bg-surface rounded-2xl border border-border p-5 space-y-2">
          <h3 className="font-semibold text-text-primary text-sm">Ajankohta</h3>
          <p className="text-sm text-text-secondary">{selectedDate} klo {selectedTime}</p>
          <p className="text-sm text-text-muted">
            {employeeName}
            {secondaryNames && secondaryNames.length > 0 && secondaryNames.map((n) => ` + ${n}`).join("")}
          </p>
        </div>
      )}

      {/* Customer */}
      <div className="bg-surface rounded-2xl border border-border p-5 space-y-2">
        <h3 className="font-semibold text-text-primary text-sm">Asiakas</h3>
        {(customerForm.firstName || customerForm.lastName) && (
          <p className="text-sm text-text-secondary">{customerForm.firstName} {customerForm.lastName}</p>
        )}
        {(customerForm.email || customerForm.phone) && (
          <p className="text-sm text-text-muted">
            {customerForm.email}
            {customerForm.email && customerForm.phone && " · "}
            {customerForm.phone}
          </p>
        )}
        <p className="text-sm text-text-muted">{formatAddress(customerForm.address, customerForm.postalCode)}</p>
        {customerForm.companyName && (
          <p className="text-sm text-text-muted">{customerForm.companyName} {customerForm.businessId && `(${customerForm.businessId})`}</p>
        )}
      </div>

      {/* Notes */}
      <div>
        <label className={labelCls}>Lisätiedot</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} placeholder="Vapaaehtoinen" />
      </div>

      {/* Lead source */}
      <div>
        <label className={labelCls}>Mistä asiakas tuli? *</label>
        <div className="flex flex-wrap gap-2">
          {leadSources.map((src) => (
            <button key={src.value} onClick={() => setLeadSource(src.value)}
              className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                leadSource === src.value ? "bg-accent-muted text-accent-dark border-accent/30" : "bg-surface text-text-secondary border-border hover:border-border-strong"
              }`}>
              {src.label}
            </button>
          ))}
        </div>
      </div>

      {/* Discount */}
      <div className="bg-surface rounded-2xl border border-border p-5 space-y-4">
        <h3 className="font-semibold text-text-primary text-sm">Alennukset</h3>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className={labelCls}>Alennuskoodi</label>
            <input value={discountCode} onChange={(e) => { setDiscountCode(e.target.value); setDiscountValid(false); setDiscountError(""); }}
              placeholder="esim. KEVAT25" className={inputCls} />
          </div>
          <button onClick={onValidateDiscount}
            className="px-4 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors">
            Tarkista
          </button>
        </div>
        {discountValid && <p className="text-sm text-green-600">Koodi hyväksytty!</p>}
        {discountError && <p className="text-sm text-red-600">{discountError}</p>}
        <div>
          <label className={labelCls}>Manuaalinen alennus (€)</label>
          <input type="number" step="0.01" value={manualDiscountCents} onChange={(e) => setManualDiscountCents(e.target.value)}
            placeholder="0" className={`${inputCls} max-w-[200px]`} />
        </div>
      </div>

      {/* Price summary */}
      <div className="bg-surface rounded-2xl border border-border p-5 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-text-muted">Välisumma</span>
          <span className="text-text-primary">{formatCents(pricing.subtotalCents)}</span>
        </div>
        {pricing.discountAmountCents > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-green-600">Alennus</span>
            <span className="text-green-600">-{formatCents(pricing.discountAmountCents)}</span>
          </div>
        )}
        <div className="flex justify-between text-sm font-bold pt-2 border-t border-border">
          <span className="text-text-primary">Yhteensä</span>
          <span className="text-text-primary">{formatCents(pricing.finalPriceCents)}</span>
        </div>
        {showLaborPortion && (
          <div className="flex justify-between text-xs">
            <span className="text-text-muted">Työn osuus (kotitalousvähennys)</span>
            <span className="text-text-muted">{formatCents(Math.max(0, pricing.finalPriceCents - pricing.totalMaterialCents))}</span>
          </div>
        )}
      </div>

      {/* Notification toggle */}
      {setSendConfirmation && (
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={sendConfirmation ?? true}
            onChange={(e) => setSendConfirmation(e.target.checked)}
            className="w-4 h-4 rounded border-border text-accent focus:ring-accent"
          />
          <span className="text-sm text-text-secondary">Lähetä varausvahvistus asiakkaalle</span>
        </label>
      )}

      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-700">{submitError}</div>
      )}

      <div className="flex justify-center gap-3 pt-4">
        <button onClick={onBack} className="px-6 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors">Takaisin</button>
        <button disabled={!canSubmit || isSubmitting} onClick={onSubmit}
          className="px-8 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40">
          {isSubmitting ? submittingLabel : submitLabel}
        </button>
      </div>
    </div>
  );
}
