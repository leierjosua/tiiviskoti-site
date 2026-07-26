import { Search } from "lucide-react";
import { inputCls } from "@/lib/constants";
import type { CustomerFormData } from "../types";

const labelCls = "block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2";

export type CustomerType = "private" | "company";

interface CustomerFormStepProps {
  customerMode: "new" | "existing";
  setCustomerMode: (mode: "new" | "existing") => void;
  customerSearch: string;
  setCustomerSearch: (s: string) => void;
  selectedCustomerId: string | null;
  setSelectedCustomerId: (id: string | null) => void;
  customerForm: CustomerFormData;
  setCustomerForm: React.Dispatch<React.SetStateAction<CustomerFormData>>;
  customers: any[] | undefined;
  customerType: CustomerType;
  setCustomerType: (t: CustomerType) => void;
  // Config
  showExistingToggle?: boolean;
  showCompanyFields?: boolean;
  showCityField?: boolean;
  readOnly?: boolean;
  // Navigation
  onBack: () => void;
  onNext: () => void;
  canProceed: boolean;
}

export function CustomerFormStep({
  customerMode, setCustomerMode,
  customerSearch, setCustomerSearch,
  selectedCustomerId, setSelectedCustomerId,
  customerForm, setCustomerForm,
  customers,
  customerType, setCustomerType,
  showExistingToggle = true,
  showCompanyFields = true,
  showCityField = false,
  readOnly = false,
  onBack, onNext, canProceed,
}: CustomerFormStepProps) {
  const isReadOnly = readOnly || customerMode === "existing";
  const isCompany = customerType === "company";
  const personReq = isCompany ? "" : " *";
  const companyReq = isCompany ? " *" : "";

  return (
    <div className="max-w-2xl space-y-6">
      {showExistingToggle && (
        <div className="flex gap-2 mb-4">
          <button
            onClick={() => { setCustomerMode("new"); setSelectedCustomerId(null); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              customerMode === "new" ? "bg-accent-muted text-accent-dark border-accent/30" : "bg-surface text-text-secondary border-border"
            }`}
          >
            Uusi asiakas
          </button>
          <button
            onClick={() => setCustomerMode("existing")}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
              customerMode === "existing" ? "bg-accent-muted text-accent-dark border-accent/30" : "bg-surface text-text-secondary border-border"
            }`}
          >
            Olemassa oleva
          </button>
        </div>
      )}

      {customerMode === "existing" && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
            <input
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              placeholder="Hae nimellä, emaililla tai puhelinnumerolla..."
              className={`${inputCls} pl-10`}
            />
          </div>
          <div className="max-h-64 overflow-y-auto space-y-2">
            {customers?.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setSelectedCustomerId(c.id);
                  setCustomerForm({
                    firstName: c.first_name || "",
                    lastName: c.last_name || "",
                    email: c.email || "",
                    phone: c.phone || "",
                    postalCode: c.postal_code || customerForm.postalCode,
                    address: c.address || "",
                    companyName: c.company_name || "",
                    businessId: c.business_id || "",
                  });
                  setCustomerType(c.company_name ? "company" : "private");
                }}
                className={`w-full p-3 rounded-xl border text-left transition-all ${
                  selectedCustomerId === c.id ? "border-accent bg-accent-muted" : "border-border hover:border-border-strong"
                }`}
              >
                <p className="text-sm font-medium text-text-primary">
                  {c.company_name || `${c.first_name || ""} ${c.last_name || ""}`.trim() || "(nimetön)"}
                </p>
                <p className="text-xs text-text-muted">{c.email || c.phone || c.business_id || "—"}</p>
              </button>
            ))}
            {customers?.length === 0 && customerSearch && (
              <p className="text-sm text-text-muted py-4 text-center">Ei tuloksia</p>
            )}
          </div>
        </div>
      )}

      {(customerMode === "new" || selectedCustomerId) && (
        <div className="space-y-4">
          {showCompanyFields && (
            <div className="flex gap-2">
              <button
                onClick={() => setCustomerType("private")}
                disabled={isReadOnly}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  customerType === "private" ? "bg-accent-muted text-accent-dark border-accent/30" : "bg-surface text-text-secondary border-border"
                } disabled:opacity-60`}
              >
                Yksityinen
              </button>
              <button
                onClick={() => setCustomerType("company")}
                disabled={isReadOnly}
                className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  customerType === "company" ? "bg-accent-muted text-accent-dark border-accent/30" : "bg-surface text-text-secondary border-border"
                } disabled:opacity-60`}
              >
                Yritys (verkkolasku)
              </button>
            </div>
          )}

          {showCompanyFields && isCompany && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Yrityksen nimi{companyReq}</label>
                <input value={customerForm.companyName} onChange={(e) => setCustomerForm((prev) => ({ ...prev, companyName: e.target.value }))}
                  className={inputCls} readOnly={isReadOnly} />
              </div>
              <div>
                <label className={labelCls}>Y-tunnus{companyReq}</label>
                <input value={customerForm.businessId} onChange={(e) => setCustomerForm((prev) => ({ ...prev, businessId: e.target.value }))}
                  placeholder="1234567-8" className={inputCls} readOnly={isReadOnly} />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Etunimi{personReq}</label>
              <input value={customerForm.firstName} onChange={(e) => setCustomerForm((prev) => ({ ...prev, firstName: e.target.value }))}
                className={inputCls} readOnly={isReadOnly} />
            </div>
            <div>
              <label className={labelCls}>Sukunimi{personReq}</label>
              <input value={customerForm.lastName} onChange={(e) => setCustomerForm((prev) => ({ ...prev, lastName: e.target.value }))}
                className={inputCls} readOnly={isReadOnly} />
            </div>
            <div>
              <label className={labelCls}>Sähköposti{personReq}</label>
              <input type="email" value={customerForm.email} onChange={(e) => setCustomerForm((prev) => ({ ...prev, email: e.target.value }))}
                className={inputCls} readOnly={isReadOnly} />
            </div>
            <div>
              <label className={labelCls}>Puhelin{personReq}</label>
              <input value={customerForm.phone} onChange={(e) => setCustomerForm((prev) => ({ ...prev, phone: e.target.value }))}
                className={inputCls} readOnly={isReadOnly} />
            </div>
            <div>
              <label className={labelCls}>Postinumero</label>
              <input value={customerForm.postalCode} onChange={(e) => setCustomerForm((prev) => ({ ...prev, postalCode: e.target.value }))}
                className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Osoite *</label>
              <input value={customerForm.address} onChange={(e) => setCustomerForm((prev) => ({ ...prev, address: e.target.value }))}
                className={inputCls} />
            </div>
            {showCityField && (
              <div>
                <label className={labelCls}>Kaupunki</label>
                <input value={customerForm.city || ""} onChange={(e) => setCustomerForm((prev) => ({ ...prev, city: e.target.value }))}
                  className={inputCls} />
              </div>
            )}
          </div>

          {showCompanyFields && !isCompany && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelCls}>Yrityksen nimi</label>
                <input value={customerForm.companyName} onChange={(e) => setCustomerForm((prev) => ({ ...prev, companyName: e.target.value }))}
                  placeholder="Valinnainen" className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Y-tunnus</label>
                <input value={customerForm.businessId} onChange={(e) => setCustomerForm((prev) => ({ ...prev, businessId: e.target.value }))}
                  placeholder="1234567-8" className={inputCls} />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-center gap-3 pt-4">
        <button onClick={onBack} className="px-6 py-2.5 border border-border rounded-xl text-sm font-medium text-text-secondary hover:bg-surface-hover transition-colors">Takaisin</button>
        <button disabled={!canProceed} onClick={onNext} className="px-6 py-2.5 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-40">Seuraava</button>
      </div>
    </div>
  );
}
