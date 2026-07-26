import { useState, useRef } from "react";
import { ChevronUp, ChevronDown, ImagePlus, Trash2, X, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { inputCls, selectCls } from "@/lib/constants";
import { useEmployees } from "@/hooks/useEmployees";
import { useCheckDuplicateOpportunity } from "@/hooks/sales/useSalesOpportunities";
import type { SalesOpportunityStage } from "@/lib/sales-types";

export interface NewDealData {
  name: string;
  phone: string;
  email: string;
  address: string;
  postcode: string;
  city: string;
  channel: string;
  status: string;
  notes: string;
  photos: File[];
  assigned_salesperson_id?: string;
}

interface NewDealPanelProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: NewDealData) => void;
  stages: SalesOpportunityStage[];
  isPending?: boolean;
}

const CHANNELS = [
  { value: "", label: "– Kanava –" },
  { value: "phone", label: "Puhelin" },
  { value: "contact_form", label: "Yhteydenottolomake" },
  { value: "door_to_door", label: "Ovelta ovelle" },
  { value: "email", label: "Sähköposti" },
  { value: "other", label: "Muu" },
];

interface FormState {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  address: string;
  postcode: string;
  city: string;
  channel: string;
  status: string;
  notes: string;
  photos: File[];
  assigned_salesperson_id: string;
}

const emptyForm: FormState = {
  firstName: "",
  lastName: "",
  phone: "",
  email: "",
  address: "",
  postcode: "",
  city: "",
  channel: "",
  status: "",
  notes: "",
  photos: [],
  assigned_salesperson_id: "",
};

export function NewDealPanel({ open, onClose, onSubmit, stages, isPending }: NewDealPanelProps) {
  const { data: sellers = [] } = useEmployees("seller");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [previews, setPreviews] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { data: duplicate } = useCheckDuplicateOpportunity(form.email, form.phone);

  const activeStages = stages.filter((s) => s.is_active && !s.is_close_stage).sort((a, b) => a.position - b.position);
  const defaultStatus = activeStages[0]?.key || "new_inbound";

  function handleClose() {
    setForm(emptyForm);
    setPreviews([]);
    setExpanded(false);
    onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const name = [form.firstName, form.lastName].filter(Boolean).join(" ");
    if (!name && !form.phone) return;
    onSubmit({
      name,
      phone: form.phone,
      email: form.email,
      address: form.address,
      postcode: form.postcode,
      city: form.city,
      channel: form.channel,
      status: form.status || defaultStatus,
      notes: form.notes,
      photos: form.photos,
      assigned_salesperson_id: form.assigned_salesperson_id || undefined,
    });
    setForm(emptyForm);
    setPreviews([]);
    setExpanded(false);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setForm((f) => ({ ...f, photos: [...f.photos, ...files] }));
    const newPreviews = files.map((f) =>
      f.type.startsWith("image/") ? URL.createObjectURL(f) : `file:${f.name}`
    );
    setPreviews((p) => [...p, ...newPreviews]);
    if (fileRef.current) fileRef.current.value = "";
  }

  function removePhoto(index: number) {
    URL.revokeObjectURL(previews[index]);
    setForm((f) => ({ ...f, photos: f.photos.filter((_, i) => i !== index) }));
    setPreviews((p) => p.filter((_, i) => i !== index));
  }

  if (!open) return null;

  const labelCls = "block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-1";

  return (
    <div className="mb-4 bg-surface border border-accent/20 rounded-2xl overflow-hidden shadow-sm">
      <form onSubmit={handleSubmit}>
        {/* Top row — always visible, compact */}
        <div className="px-4 pt-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold">Uusi diili</h3>
            <button type="button" onClick={handleClose} className="p-0.5 rounded text-text-muted hover:text-text">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
            <input
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              placeholder="Etunimi *"
              className={`${inputCls} !py-1.5 !text-xs`}
              autoFocus
            />
            <input
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              placeholder="Sukunimi"
              className={`${inputCls} !py-1.5 !text-xs`}
            />
            <input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="Puhelin"
              type="tel"
              className={`${inputCls} !py-1.5 !text-xs`}
            />
            <select
              value={form.status || defaultStatus}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              className={`${selectCls} !py-1.5 !text-xs`}
            >
              {activeStages.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            <select
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value })}
              className={`${selectCls} !py-1.5 !text-xs`}
            >
              {CHANNELS.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <select
              value={form.assigned_salesperson_id}
              onChange={(e) => setForm({ ...form, assigned_salesperson_id: e.target.value })}
              className={`${selectCls} !py-1.5 !text-xs`}
            >
              <option value="">– Myyjä –</option>
              {sellers.filter((s) => s.active !== false).map((s) => (
                <option key={s.id} value={s.id}>{s.first_name} {s.last_name}</option>
              ))}
            </select>
          </div>

          {/* Duplicate warning */}
          {duplicate && (
            <div className="mt-2 flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-amber-800">
                <p className="font-semibold">Olemassa oleva diili löytyi</p>
                <p className="mt-0.5">
                  {duplicate.name || "Nimetön"} — {duplicate.email || duplicate.phone || ""}
                  {" · "}
                  <Link
                    to={`/myynti/inbound/${duplicate.id}`}
                    className="font-medium text-accent underline hover:no-underline"
                  >
                    Avaa diili
                  </Link>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Expand toggle */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-center gap-1 py-1 text-[10px] font-medium text-text-muted hover:text-accent transition-colors border-t border-border/50"
        >
          {expanded ? (
            <><ChevronUp className="w-3 h-3" /> Vähemmän tietoja</>
          ) : (
            <><ChevronDown className="w-3 h-3" /> Lisää tietoja (osoite, lisätiedot, liitteet)</>
          )}
        </button>

        {/* Expanded section */}
        {expanded && (
          <div className="px-4 pt-2 pb-3 border-t border-border/50 space-y-3">
            {/* Email + Address */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Sähköposti</label>
                <input
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="matti@esimerkki.fi"
                  type="email"
                  className={`${inputCls} !py-1.5 !text-xs`}
                />
              </div>
              <div>
                <label className={labelCls}>Osoite</label>
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  placeholder="Esimerkkikatu 1"
                  className={`${inputCls} !py-1.5 !text-xs`}
                />
              </div>
            </div>

            {/* Postcode + City */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={labelCls}>Postinumero</label>
                <input
                  value={form.postcode}
                  onChange={(e) => setForm({ ...form, postcode: e.target.value })}
                  placeholder="00100"
                  className={`${inputCls} !py-1.5 !text-xs`}
                />
              </div>
              <div>
                <label className={labelCls}>Kaupunki</label>
                <input
                  value={form.city}
                  onChange={(e) => setForm({ ...form, city: e.target.value })}
                  placeholder="Helsinki"
                  className={`${inputCls} !py-1.5 !text-xs`}
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className={labelCls}>Lisätiedot</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Kirjoita lisätietoja..."
                rows={4}
                className={`${inputCls} !text-xs resize-y`}
              />
            </div>

            {/* Photos */}
            <div>
              <label className={labelCls}>Liitteet</label>
              <div className="flex flex-wrap gap-2">
                {previews.map((src, i) => (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-border group">
                    {src.startsWith("file:") ? (
                      <div className="w-full h-full flex items-center justify-center bg-muted/30 p-1">
                        <span className="text-[7px] font-medium text-text-muted text-center break-all leading-tight">{src.slice(5)}</span>
                      </div>
                    ) : (
                      <img src={src} alt="" className="w-full h-full object-cover" />
                    )}
                    <button
                      type="button"
                      onClick={() => removePhoto(i)}
                      className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-white" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-16 h-16 rounded-lg border-2 border-dashed border-border hover:border-accent/50 flex flex-col items-center justify-center gap-0.5 text-text-muted hover:text-accent transition-colors"
                >
                  <ImagePlus className="w-4 h-4" />
                  <span className="text-[8px] font-medium">Lisää</span>
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>
            </div>
          </div>
        )}

        {/* Actions — always visible */}
        <div className="flex items-center justify-end gap-2 px-4 py-2.5 bg-muted/20 border-t border-border/50">
          <button type="button" onClick={handleClose} className="px-3 py-1.5 text-xs font-medium text-text-muted hover:text-text">
            Peruuta
          </button>
          <button
            type="submit"
            disabled={isPending || (!form.firstName && !form.phone)}
            className="px-4 py-1.5 bg-accent text-white rounded-xl text-xs font-medium hover:bg-accent/90 disabled:opacity-50 transition-colors"
          >
            {isPending ? "Luodaan..." : "Luo diili"}
          </button>
        </div>
      </form>
    </div>
  );
}
