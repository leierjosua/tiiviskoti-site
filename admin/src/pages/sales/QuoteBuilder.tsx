import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, FileText, Save, Send, Lock } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSalesOpportunity } from "@/hooks/sales/useSalesOpportunities";
import { useOffersByOpportunity, useCreateOffer, useUpdateOffer } from "@/hooks/sales/useSalesOffers";
import { useSalesQuoteTemplates } from "@/hooks/sales/useSalesQuoteTemplates";
import { OfferStatusBadge } from "@/components/sales/SalesStatusBadge";
import { QuoteCatalogPicker, type CatalogPickerItem } from "@/components/sales/QuoteCatalogPicker";
import { QuoteLineItemEditor } from "@/components/sales/QuoteLineItemEditor";
import { inputCls, selectCls } from "@/lib/constants";
import { useToast } from "@/context/ToastContext";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/queryKeys";
import type { SalesOffer } from "@/lib/sales-types";

export default function QuoteBuilder() {
  const { opportunityId } = useParams<{ opportunityId: string }>();
  const [searchParams] = useSearchParams();
  const offerIdParam = searchParams.get("offerId");
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();

  const { data: opp } = useSalesOpportunity(opportunityId);
  const { data: offers = [] } = useOffersByOpportunity(opportunityId);
  const { data: templates = [] } = useSalesQuoteTemplates();
  const createOffer = useCreateOffer();
  const updateOffer = useUpdateOffer();

  const [activeOffer, setActiveOffer] = useState<SalesOffer | null>(null);
  const [form, setForm] = useState({
    title: "",
    customer_name: "",
    customer_email: "",
    customer_phone: "",
    customer_address: "",
    customer_postcode: "",
    customer_city: "",
    discount: 0,
  });
  const [lineItems, setLineItems] = useState<Array<{
    id?: string;
    line_type: string;
    name: string;
    description: string;
    unit_price: number;
    quantity: number;
    sort_order: number;
    item_id?: string | null;
    duration_minutes?: number | null;
  }>>([]);

  // Load active offer when offers change. If offerId param is given, load that specific
  // offer; otherwise fall back to the most recent one.
  useEffect(() => {
    if (offers.length > 0 && !activeOffer) {
      const offer = offerIdParam
        ? offers.find((o) => o.id === offerIdParam) || offers[0]
        : offers[0];
      setActiveOffer(offer);
      setForm({
        title: offer.title || "",
        customer_name: offer.customer_name || "",
        customer_email: offer.customer_email || "",
        customer_phone: offer.customer_phone || "",
        customer_address: offer.customer_address || "",
        customer_postcode: offer.customer_postcode || "",
        customer_city: offer.customer_city || "",
        discount: Number(offer.discount) || 0,
      });
      setLineItems(
        (offer.sales_offer_line_items || [])
          .slice()
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((li) => ({
            id: li.id,
            line_type: li.line_type,
            name: li.name,
            description: li.description || "",
            unit_price: Number(li.unit_price),
            quantity: li.quantity,
            sort_order: li.sort_order,
            item_id: li.item_id ?? null,
            duration_minutes: li.duration_minutes ?? null,
          }))
      );
    }
  }, [offers, activeOffer, offerIdParam]);

  const locked = activeOffer?.status === "accepted";

  // Pre-fill from opportunity
  useEffect(() => {
    if (opp && !activeOffer && offers.length === 0) {
      setForm((f) => ({
        ...f,
        customer_name: opp.name || "",
        customer_email: opp.email || "",
        customer_phone: opp.phone || "",
        customer_address: opp.address || "",
        customer_postcode: opp.postcode || "",
        customer_city: opp.city || "",
      }));
    }
  }, [opp, activeOffer, offers.length]);

  const subtotal = lineItems.reduce((sum, li) => sum + li.unit_price * li.quantity, 0);
  const total = subtotal - form.discount;

  async function persistLineItems(offerId: string) {
    // Diff current state against the loaded offer and sync three-way:
    // existing ids dropped from state → delete; items with id → update; new items → insert.
    const originalIds = new Set(
      (activeOffer?.sales_offer_line_items || []).map((li) => li.id)
    );
    const keptIds = new Set(lineItems.filter((li) => li.id).map((li) => li.id!));
    const removedIds = [...originalIds].filter((id) => !keptIds.has(id));

    if (removedIds.length > 0) {
      const { error } = await supabase
        .from("sales_offer_line_items")
        .delete()
        .in("id", removedIds);
      if (error) throw error;
    }

    const updates = lineItems
      .map((li, idx) => ({ ...li, sort_order: idx }))
      .filter((li) => li.id);
    const inserts = lineItems
      .map((li, idx) => ({ ...li, sort_order: idx }))
      .filter((li) => !li.id);

    for (const li of updates) {
      const { error } = await supabase
        .from("sales_offer_line_items")
        .update({
          line_type: li.line_type,
          name: li.name,
          description: li.description || null,
          unit_price: li.unit_price,
          quantity: li.quantity,
          sort_order: li.sort_order,
          item_id: li.item_id ?? null,
          duration_minutes: li.duration_minutes ?? null,
        })
        .eq("id", li.id!);
      if (error) throw error;
    }

    if (inserts.length > 0) {
      const rows = inserts.map((li) => ({
        offer_id: offerId,
        line_type: li.line_type,
        name: li.name,
        description: li.description || null,
        unit_price: li.unit_price,
        quantity: li.quantity,
        sort_order: li.sort_order,
        item_id: li.item_id ?? null,
        duration_minutes: li.duration_minutes ?? null,
      }));
      const { error } = await supabase.from("sales_offer_line_items").insert(rows);
      if (error) throw error;
    }
  }

  async function handleSave() {
    if (locked) return;
    try {
      let offerId: string;
      if (activeOffer) {
        await updateOffer.mutateAsync({
          id: activeOffer.id,
          title: form.title,
          customer_name: form.customer_name,
          customer_email: form.customer_email,
          customer_phone: form.customer_phone,
          customer_address: form.customer_address,
          customer_postcode: form.customer_postcode,
          customer_city: form.customer_city,
          subtotal,
          discount: form.discount,
          total,
        });
        offerId = activeOffer.id;
      } else {
        const offer = await createOffer.mutateAsync({
          opportunity_id: opportunityId!,
          title: form.title,
          customer_name: form.customer_name,
          customer_email: form.customer_email,
          customer_phone: form.customer_phone,
          customer_address: form.customer_address,
          customer_postcode: form.customer_postcode,
          customer_city: form.customer_city,
        });
        setActiveOffer(offer);
        offerId = offer.id;
      }
      await persistLineItems(offerId);
      qc.invalidateQueries({ queryKey: queryKeys.sales.offers.byOpportunity(opportunityId) });
      qc.invalidateQueries({ queryKey: queryKeys.sales.offers.detail(offerId) });
      toast(activeOffer ? "Tarjous tallennettu" : "Tarjous luotu");
    } catch (err) {
      console.error(err);
      toast("Virhe tallennuksessa", "error");
    }
  }

  async function handleSend() {
    if (!activeOffer) return;
    await updateOffer.mutateAsync({ id: activeOffer.id, status: "sent", sent_at: new Date().toISOString() });
    toast("Tarjous merkitty lähetetyksi");
  }

  function handleApplyTemplate(templateId: string) {
    const template = templates.find((t) => t.id === templateId);
    if (!template) return;
    const items = (template.sales_quote_template_items || []).map((ti, i) => ({
      line_type: ti.line_type === "addon_service" ? "additional_service" : ti.line_type === "custom" ? "other_charge" : ti.line_type,
      name: ti.name,
      description: ti.description || "",
      unit_price: ti.unit_price_cents / 100,
      quantity: ti.quantity,
      sort_order: i,
    }));
    setLineItems([...lineItems, ...items]);
    toast(`Malli "${template.name}" lisätty`);
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors flex-shrink-0">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <FileText className="w-5 h-5 text-accent flex-shrink-0" />
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary truncate">
              {activeOffer ? `Tarjous #${activeOffer.offer_number || "–"}` : "Uusi tarjous"}
            </h1>
            {activeOffer && <OfferStatusBadge status={activeOffer.status} />}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!locked && (
            <button onClick={handleSave} className="flex items-center gap-1.5 px-3 py-2 sm:py-1.5 bg-accent text-white rounded-xl text-xs font-medium hover:bg-accent/90">
              <Save className="w-3.5 h-3.5" /> Tallenna
            </button>
          )}
          {!locked && activeOffer && activeOffer.status === "draft" && (
            <button onClick={handleSend} className="flex items-center gap-1.5 px-3 py-2 sm:py-1.5 bg-blue-600 text-white rounded-xl text-xs font-medium hover:bg-blue-700">
              <Send className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Merkitse lähetetyksi</span><span className="sm:hidden">Lähetetty</span>
            </button>
          )}
        </div>
      </div>

      {locked && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
          <Lock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <div>
            Tarjous on hyväksytty ja muutettu varaukseksi — muokkaus on lukittu. Muutokset tehdään nyt varauksen kautta.
          </div>
        </div>
      )}

      <fieldset disabled={locked} className="grid grid-cols-1 lg:grid-cols-3 gap-6 disabled:opacity-75 disabled:cursor-not-allowed min-w-0">
        {/* Left: Customer Info */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Asiakastiedot</h3>
            {(["customer_name", "customer_phone", "customer_email", "customer_address", "customer_postcode", "customer_city"] as const).map((field) => (
              <div key={field}>
                <label className="text-[10px] font-semibold text-text-muted uppercase">
                  {{ customer_name: "Nimi", customer_phone: "Puhelin", customer_email: "Sähköposti", customer_address: "Osoite", customer_postcode: "Postinumero", customer_city: "Kaupunki" }[field]}
                </label>
                <input
                  value={form[field]}
                  onChange={(e) => setForm({ ...form, [field]: e.target.value })}
                  className={`${inputCls} !py-1.5 !text-xs`}
                />
              </div>
            ))}
          </div>

          {/* Template selector */}
          {templates.length > 0 && (
            <div className="bg-surface border border-border rounded-2xl p-4">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Tarjousmalli</h3>
              <select onChange={(e) => e.target.value && handleApplyTemplate(e.target.value)} className={selectCls}>
                <option value="">Valitse malli...</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Right: Line Items */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-surface border border-border rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Tarjouksen otsikko</h3>
            </div>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="esim. Ilmalämpöpumpun asennus"
              className={`${inputCls} !py-2`}
            />
          </div>

          <div className="bg-surface border border-border rounded-2xl p-4 space-y-3">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Lisää rivi katalogista</h3>
            <QuoteCatalogPicker
              onAdd={(item: CatalogPickerItem) =>
                setLineItems((prev) => [
                  ...prev,
                  {
                    line_type: item.line_type,
                    name: item.name,
                    description: item.description,
                    unit_price: item.unit_price,
                    quantity: item.quantity,
                    sort_order: prev.length,
                    item_id: item.item_id,
                    duration_minutes: item.duration_minutes ?? null,
                  },
                ])
              }
            />
          </div>

          <div className="bg-surface border border-border rounded-2xl p-4">
            <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-3">Tarjousrivit</h3>
            <QuoteLineItemEditor items={lineItems} onChange={setLineItems} />
          </div>

          {/* Summary */}
          <div className="bg-surface border border-border rounded-2xl p-4">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-text-muted">Välisumma</span>
                <span>{subtotal.toFixed(2)} €</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-muted">Alennus</span>
                <div className="relative w-28">
                  <input
                    type="number"
                    value={form.discount}
                    onChange={(e) => setForm({ ...form, discount: parseFloat(e.target.value) || 0 })}
                    className={`${inputCls} !py-1 !text-xs !pr-6 text-right`}
                    step="0.01"
                    min={0}
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-text-muted">€</span>
                </div>
              </div>
              <div className="flex justify-between pt-2 border-t border-border font-bold">
                <span>Yhteensä</span>
                <span>{total.toFixed(2)} €</span>
              </div>
            </div>
          </div>
        </div>
      </fieldset>
    </div>
  );
}
