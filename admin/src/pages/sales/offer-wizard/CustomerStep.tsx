import type { CustomerData, WizardAction } from "./types";
import { inputCls } from "@/lib/constants";
import { postalCity } from "@/lib/utils";

const labelCls = "block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2";

interface Props {
  customer: CustomerData;
  dispatch: React.Dispatch<WizardAction>;
}

export function CustomerStep({ customer, dispatch }: Props) {
  const update = (field: keyof CustomerData, value: string) =>
    dispatch({ type: "UPDATE_CUSTOMER", field, value });

  const handlePostcodeChange = (val: string) => {
    update("postcode", val);
    if (val.length >= 2) {
      const city = postalCity(val);
      if (city) update("city", city);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-text-primary">Asiakastiedot</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Etunimi</label>
          <input className={inputCls} value={customer.firstName} onChange={(e) => update("firstName", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Sukunimi</label>
          <input className={inputCls} value={customer.lastName} onChange={(e) => update("lastName", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Sähköposti</label>
          <input className={inputCls} type="email" value={customer.email} onChange={(e) => update("email", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Puhelin</label>
          <input className={inputCls} value={customer.phone} onChange={(e) => update("phone", e.target.value)} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Osoite</label>
        <input className={inputCls} value={customer.address} onChange={(e) => update("address", e.target.value)} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>Postinumero</label>
          <input className={inputCls} value={customer.postcode} onChange={(e) => handlePostcodeChange(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Kaupunki</label>
          <input className={inputCls} value={customer.city} onChange={(e) => update("city", e.target.value)} />
        </div>
      </div>
    </div>
  );
}
