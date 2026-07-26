import { useState, useEffect } from "react";
import { Send, FileSignature, Download, RotateCcw, Clock } from "lucide-react";
import type { WizardState, WizardAction } from "./types";
import type { LineItem } from "./types";
import type { Employee } from "@/lib/types";
import { formatAddress } from "@/lib/utils";
import type { OfferPdfData } from "@/components/sales/OfferPdfContent";
import { OfferPdfContent } from "@/components/sales/OfferPdfContent";
import { downloadPdfFromElement } from "@/lib/chromiumPdf";
import { formatCents } from "@/lib/utils";
import { inputCls } from "@/lib/constants";
import { supabase } from "@/lib/supabase";
import { lineItemKey, lineMargin } from "./computeLineItems";

const labelCls = "block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2";

/** Editable price input for a single line item — dispatches SET_PRICE_OVERRIDE in cents. */
function LineItemPriceInput({
  li,
  dispatch,
}: {
  li: LineItem;
  dispatch: React.Dispatch<WizardAction>;
}) {
  const key = lineItemKey(li);
  const [text, setText] = useState((li.unitPriceCents / 100).toFixed(2));
  const isOverridden = li.defaultUnitPriceCents != null;

  // Sync local text when the canonical price changes (e.g. user changed qty/variant elsewhere)
  useEffect(() => {
    setText((li.unitPriceCents / 100).toFixed(2));
  }, [li.unitPriceCents]);

  const commit = (raw: string) => {
    const parsed = parseFloat(raw.replace(",", "."));
    if (isNaN(parsed) || parsed < 0) {
      setText((li.unitPriceCents / 100).toFixed(2));
      return;
    }
    const cents = Math.round(parsed * 100);
    if (cents === li.unitPriceCents) return;
    dispatch({ type: "SET_PRICE_OVERRIDE", key, cents });
  };

  const reset = () => {
    dispatch({ type: "SET_PRICE_OVERRIDE", key, cents: null });
  };

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        step="0.01"
        min="0"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        className="w-20 text-right rounded-md border border-border bg-bg-primary px-2 py-1 text-xs"
      />
      <span className="text-text-muted text-[10px]">&euro;</span>
      {isOverridden && (
        <button
          type="button"
          onClick={reset}
          title={`Palauta oletushinta (${formatCents(li.defaultUnitPriceCents!)})`}
          className="text-text-muted hover:text-text-primary"
        >
          <RotateCcw size={12} />
        </button>
      )}
    </div>
  );
}

/** Renders a row in the summary line-item list with an editable unit price. */
function LineItemRow({
  li,
  dispatch,
  showMargin,
}: {
  li: LineItem;
  dispatch: React.Dispatch<WizardAction>;
  showMargin: boolean;
}) {
  const m = showMargin ? lineMargin(li) : null;
  const b = li.costBreakdown;
  const breakdownTitle = b
    ? `Materiaali ${formatCents(b.material * li.qty)} · Alihankkija ${formatCents(b.labor * li.qty)} · Myyntiprovisio ${formatCents(b.salesCommission * li.qty)}`
    : "";
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-text-primary truncate">{li.name}</p>
        <p className="text-[10px] text-text-muted">{li.qty} kpl x</p>
        {m && (
          <p
            className={`text-[10px] font-medium ${m.marginCents >= 0 ? "text-emerald-600" : "text-red-600"}`}
            title={breakdownTitle}
          >
            Kate {formatCents(m.marginCents)} ({m.marginPct.toFixed(0)}%)
            <span className="text-text-muted font-normal ml-1">· kulu {formatCents(m.costCents)}</span>
          </p>
        )}
      </div>
      <LineItemPriceInput li={li} dispatch={dispatch} />
      <span className="text-sm font-medium text-text-primary w-20 text-right">{formatCents(li.unitPriceCents * li.qty)}</span>
    </div>
  );
}

interface Props {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  lineItems: LineItem[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
  optionGroups: string[];
  totalCostCents: number;
  marginCents: number;
  marginPct: number;
  employee: Employee | null;
  onSend: () => void;
  onSignNow: () => void;
  onSignPendingConfirm: () => void;
  isSubmitting: boolean;
}

export function SummaryStep({
  state,
  dispatch,
  lineItems,
  subtotalCents,
  discountCents,
  totalCents,
  optionGroups,
  totalCostCents,
  marginCents,
  marginPct,
  employee,
  onSend,
  onSignNow,
  onSignPendingConfirm,
  isSubmitting,
}: Props) {
  const { customer, offerTitle, noteTitle, noteContent, discount, emailBody, signatureDataUrl, signerName, pendingConfirmEmailSubject, pendingConfirmEmailBody } = state;

  // Pre-fill email subject and body with defaults on first render
  useEffect(() => {
    if (!offerTitle) {
      dispatch({ type: "SET_FIELD", field: "offerTitle", value: "Tarjous ja varauslinkki" });
    }
    if (!emailBody) {
      dispatch({ type: "SET_FIELD", field: "emailBody", value: `Moikka ${customer.firstName},\n\nLiitteenä tarjous ja asennussuunnitelma. Voit hyväksyä tarjouksen varaamalla ajan alta.` });
    }
    if (!pendingConfirmEmailSubject) {
      dispatch({ type: "SET_FIELD", field: "pendingConfirmEmailSubject", value: "Vahvista asennusaika kun olet saanut taloyhtiön luvan" });
    }
    if (!pendingConfirmEmailBody) {
      dispatch({
        type: "SET_FIELD",
        field: "pendingConfirmEmailBody",
        value: `Moikka ${customer.firstName},\n\nKiitos! Liitteenä allekirjoitettu tarjous ja asennussuunnitelma. Asennusaika on varattu sinulle.\n\nPaina alla olevaa "Vahvista asennusaika" -nappia, josta pääset vahvistamaan asennusajan taloyhtiöltä saadulla luvalla. Sen jälkeen saat varausvahvistuksen sähköpostiisi.\n\nMikäli lupaa ei ole saatu viimeistään viikkoa ennen sovittua asennuspäivää, ole yhteydessä niin sovitaan jatkosta.`,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch next offer number preview.
  // Mirrors the DB trigger generate_offer_number() logic, including the
  // 2026-specific floor of 218 (next 2026 offer = 219+).
  const [previewOfferNumber, setPreviewOfferNumber] = useState("–");
  useEffect(() => {
    const year = new Date().getFullYear().toString();
    supabase
      .from("sales_offers")
      .select("offer_number")
      .like("offer_number", `${year}-%`)
      .order("offer_number", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const lastSeq = data?.offer_number ? parseInt(data.offer_number.split("-")[1], 10) : 0;
        const floor = year === "2026" ? 218 : 0;
        const nextSeq = Math.max(lastSeq, floor) + 1;
        setPreviewOfferNumber(`${year}-${String(nextSeq).padStart(3, "0")}`);
      });
  }, []);

  // Categorize line items
  const baseItems = lineItems.filter((li) => !li.optionGroup && !li.isUpsell);
  const upsellItems = lineItems.filter((li) => li.isUpsell);
  const hasGroups = optionGroups.length > 0;
  const hasUpsells = upsellItems.length > 0;

  const pdfData: OfferPdfData = {
    offerNumber: previewOfferNumber,
    title: offerTitle || "Tarjous",
    createdAt: new Date().toISOString(),
    customerName: `${customer.firstName} ${customer.lastName}`.trim(),
    customerAddress: formatAddress(customer.address, customer.postcode, customer.city),
    customerContact: [customer.email, customer.phone].filter(Boolean).join(" \u00B7 "),
    customerEmail: customer.email || undefined,
    customerPhone: customer.phone || undefined,
    lineItems: lineItems.map((li) => ({
      name: li.name,
      description: null,
      quantity: li.qty,
      unitPrice: li.unitPriceCents / 100,
      totalPrice: (li.unitPriceCents * li.qty) / 100,
      lineType: li.lineType,
      optionGroup: li.optionGroup ?? null,
      isUpsell: li.isUpsell ?? false,
    })),
    subtotal: subtotalCents / 100,
    discount: discountCents / 100,
    total: totalCents / 100,
    sellerName: employee ? `${employee.first_name} ${employee.last_name}`.trim() : undefined,
    noteTitle: noteTitle || undefined,
    noteContent: noteContent || undefined,
    signatureDataUrl: signatureDataUrl || undefined,
    signerName: signerName || undefined,
    optionGroups: optionGroups.length > 0 ? optionGroups : undefined,
    validityDays: state.validityDays,
  };

  const handleDownloadPdf = async () => {
    const el = document.getElementById("offer-pdf-visual-preview") || document.getElementById("offer-pdf-preview");
    if (!el) return;
    await downloadPdfFromElement(
      el,
      `Tarjous - ${`${customer.firstName} ${customer.lastName}`.trim() || "asiakas"}.pdf`,
    );
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-text-primary">Tarjouksen yhteenveto</h2>

      {/* Customer summary */}
      <div className="bg-bg-secondary rounded-lg p-4">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide mb-2">Asiakas</h3>
        <p className="text-sm text-text-primary font-medium">{customer.firstName} {customer.lastName}</p>
        <p className="text-sm text-text-muted break-all sm:break-normal">{customer.email} | {customer.phone}</p>
        <p className="text-sm text-text-muted">{customer.address}, {customer.postcode} {customer.city}</p>
      </div>

      {/* Line items — grouped */}
      <div className="bg-bg-secondary rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Rivit</h3>
          <label className="flex items-center gap-1.5 cursor-pointer text-[11px] text-text-muted hover:text-text-primary select-none">
            <input
              type="checkbox"
              checked={state.showMargin}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "showMargin", value: e.target.checked })}
              className="w-3.5 h-3.5 accent-brand"
            />
            Näytä kate
          </label>
        </div>
        {lineItems.length === 0 && <p className="text-sm text-text-muted">Ei rivejä</p>}

        {/* Base items */}
        {baseItems.length > 0 && (
          <div className="mb-3">
            {(hasGroups || hasUpsells) && <p className="text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">Sisältyy aina</p>}
            <div className="divide-y divide-border">
              {baseItems.map((li) => (
                <LineItemRow key={lineItemKey(li)} li={li} dispatch={dispatch} showMargin={state.showMargin} />
              ))}
            </div>
          </div>
        )}

        {/* Option groups */}
        {optionGroups.map((groupName) => {
          const groupItems = lineItems.filter((li) => li.optionGroup === groupName);
          if (groupItems.length === 0) return null;
          const groupTotal = groupItems.reduce((s, li) => s + li.unitPriceCents * li.qty, 0);
          return (
            <div key={groupName} className="mb-3 border-l-2 border-blue-400 pl-3">
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide">Vaihtoehto: {groupName}</p>
                <span className="text-[10px] font-medium text-text-muted">{formatCents(groupTotal)}</span>
              </div>
              <div className="divide-y divide-border">
                {groupItems.map((li) => (
                  <LineItemRow key={lineItemKey(li)} li={li} dispatch={dispatch} showMargin={state.showMargin} />
                ))}
              </div>
            </div>
          );
        })}

        {/* Upsells */}
        {hasUpsells && (
          <div className="mb-3 border-l-2 border-amber-400 pl-3">
            <p className="text-[10px] font-semibold text-amber-600 uppercase tracking-wide mb-2">Lisämyynti (asiakas valitsee)</p>
            <div className="divide-y divide-border">
              {upsellItems.map((li) => (
                <LineItemRow key={lineItemKey(li)} li={li} dispatch={dispatch} showMargin={state.showMargin} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Totals */}
      <div className="bg-bg-secondary rounded-lg p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-text-muted">Välisumma</span>
          <span className="text-text-primary">{formatCents(subtotalCents)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Alennus</span>
          <div className="flex items-center gap-1">
            <input
              className="w-20 text-right rounded-lg border border-border bg-bg-secondary px-2 py-1 text-sm"
              type="number"
              step="0.01"
              min="0"
              value={discount}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "discount", value: e.target.value })}
              placeholder="0.00"
            />
            <span className="text-text-muted text-xs">&euro;</span>
          </div>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-muted">Voimassaolo</span>
          <div className="flex items-center gap-1">
            <input
              className="w-16 text-right rounded-lg border border-border bg-bg-secondary px-2 py-1 text-sm"
              type="number"
              min="1"
              max="90"
              value={state.validityDays}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "validityDays", value: Math.max(1, parseInt(e.target.value) || 30) })}
            />
            <span className="text-text-muted text-xs">pv</span>
          </div>
        </div>
        <div className="border-t border-border pt-2 flex justify-between text-sm font-bold">
          <span>Yhteensä {hasGroups && <span className="font-normal text-text-muted text-xs">(alk.)</span>}</span>
          <span>{formatCents(totalCents)}</span>
        </div>
        {state.showMargin && (
          <div className="border-t border-border pt-2 space-y-1">
            <div className="flex justify-between text-xs text-text-muted">
              <span>Kustannukset (arvio)</span>
              <span>{formatCents(totalCostCents)}</span>
            </div>
            <div className={`flex justify-between text-sm font-semibold ${marginCents >= 0 ? "text-emerald-600" : "text-red-600"}`}>
              <span>Kate (alv 0%)</span>
              <span>{formatCents(marginCents)} ({marginPct.toFixed(1)}%)</span>
            </div>
          </div>
        )}
      </div>

      {/* Email body (always visible) */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Sähköpostin esikatselu — Lähetä tarjous</h3>
        <div className="bg-muted/20 rounded-lg p-4 space-y-2">
          <div>
            <label className="text-xs font-medium text-text-muted mb-1 block">Aihe</label>
            <input
              className={inputCls}
              value={offerTitle}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "offerTitle", value: e.target.value })}
              placeholder="Tarjous ja varauslinkki"
            />
          </div>
          <textarea
            className={`${inputCls} min-h-[100px]`}
            value={emailBody}
            onChange={(e) => dispatch({ type: "SET_FIELD", field: "emailBody", value: e.target.value })}
            placeholder={`Moikka ${customer.firstName},\n\nLiitteenä tarjous ja asennussuunnitelma. Voit hyväksyä tarjouksen varaamalla ajan alta.`}
          />
          <p className="text-[10px] text-text-muted">Tarjouslinkki ja "Tarjous voimassa X päivää" -teksti lisätään tähän automaattisesti.</p>
        </div>
      </div>

      {/* Pending-confirm email preview (always visible, used in sign_pending_confirm flow) */}
      <div className="space-y-3">
        <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Sähköpostin esikatselu — Allekirjoita + odota lupaa</h3>
        <div className="bg-amber-50/40 border border-amber-200/60 rounded-lg p-4 space-y-2">
          <div>
            <label className="text-xs font-medium text-text-muted mb-1 block">Aihe</label>
            <input
              className={inputCls}
              value={pendingConfirmEmailSubject}
              onChange={(e) => dispatch({ type: "SET_FIELD", field: "pendingConfirmEmailSubject", value: e.target.value })}
              placeholder="Vahvista asennusaika kun olet saanut taloyhtiön luvan"
            />
          </div>
          <textarea
            className={`${inputCls} min-h-[140px]`}
            value={pendingConfirmEmailBody}
            onChange={(e) => dispatch({ type: "SET_FIELD", field: "pendingConfirmEmailBody", value: e.target.value })}
          />
          <p className="text-[10px] text-text-muted">"Vahvista asennusaika" -nappi ja vahvistuslinkki lisätään tähän automaattisesti.</p>
        </div>
      </div>

      {/* Note */}
      <div>
        <label className={labelCls}>Huomautus tarjouksessa (valinnainen)</label>
        <input className={inputCls + " mb-2"} value={noteTitle} onChange={(e) => dispatch({ type: "SET_FIELD", field: "noteTitle", value: e.target.value })} placeholder="Otsikko, esim. Huomautus kylmäaineista" />
        <textarea className={inputCls} value={noteContent} onChange={(e) => dispatch({ type: "SET_FIELD", field: "noteContent", value: e.target.value })} placeholder="Sisältö..." rows={3} style={{ resize: "vertical" }} />
      </div>

      {/* Inside notes for installer */}
      <div>
        <label className={labelCls}>Sisäiset muistiinpanot asentajalle</label>
        <textarea
          className={inputCls}
          value={state.insideNotes}
          onChange={(e) => dispatch({ type: "SET_FIELD", field: "insideNotes", value: e.target.value })}
          placeholder="Nämä näkyvät vain asentajalle, ei asiakkaalle..."
          rows={3}
          style={{ resize: "vertical" }}
        />
      </div>

      {/* PDF preview (hidden on mobile) */}
      <div className="overflow-hidden">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="text-xs font-semibold text-text-muted uppercase tracking-wide">Tarjouksen esikatselu</h3>
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1e3a8a] text-white rounded-lg text-xs font-semibold hover:bg-[#1e3a8a]/90 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            Lataa PDF
          </button>
        </div>
        <div
          id="offer-pdf-visual-preview"
          className="hidden sm:block border border-border rounded-2xl overflow-hidden bg-white shadow-sm max-h-[600px] overflow-y-auto"
          style={{ transform: "scale(0.7)", transformOrigin: "top left", width: "142.86%", marginBottom: "-180px" }}
        >
          <OfferPdfContent data={pdfData} />
        </div>
      </div>

      {/* CTA buttons */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4">
        <button
          onClick={onSend}
          disabled={isSubmitting || lineItems.length === 0}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-brand text-white text-sm font-semibold hover:bg-brand/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting && state.deliveryMode === "send" ? (
            <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
          ) : (
            <>
              <Send size={16} /> Lähetä tarjous
            </>
          )}
        </button>
        <button
          onClick={onSignNow}
          disabled={isSubmitting || lineItems.length === 0}
          className="flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-gray-900 text-white text-sm font-semibold hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <FileSignature size={16} /> Allekirjoita nyt
        </button>
      </div>
      <div className="pt-1">
        <button
          onClick={onSignPendingConfirm}
          disabled={isSubmitting || lineItems.length === 0}
          className="w-full flex items-center justify-center gap-2 px-5 py-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 text-sm font-semibold hover:bg-amber-100 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Allekirjoita nyt, varaa alustava aika, asiakas vahvistaa myöhemmin (esim. taloyhtiön luvan saatuaan)"
        >
          <Clock size={16} /> Allekirjoita + odota lupaa
        </button>
        <p className="text-[11px] text-text-muted mt-1.5 text-center">
          Asennusaika on varattu asiakkaalle. Asiakas vahvistaa taloyhtiön luvan saatuaan; jos lupaa ei tule viikkoa ennen asennusta, asiakas ottaa yhteyttä myyjään.
        </p>
      </div>
    </div>
  );
}
