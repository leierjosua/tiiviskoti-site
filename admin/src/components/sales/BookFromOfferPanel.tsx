import { useState, useEffect, useRef, useMemo } from "react";
import { X } from "lucide-react";
import { CalendarStep } from "@/components/CalendarStep";
import { useServices } from "@/hooks/useServices";
import { useEmployees } from "@/hooks/useEmployees";
import { useServiceAreas } from "@/hooks/useServices";
import { useAddonServices } from "@/hooks/useAddonServices";
import { supabase } from "@/lib/supabase";
import { useToast } from "@/context/ToastContext";
import type { SalesOffer, SalesOpportunity } from "@/lib/sales-types";

interface BookFromOfferPanelProps {
  offer: SalesOffer;
  opportunity: SalesOpportunity;
  onClose: () => void;
  onSuccess: () => void;
}

export function BookFromOfferPanel({ offer, opportunity, onClose, onSuccess }: BookFromOfferPanelProps) {
  const toast = useToast();
  const { data: allServices } = useServices();
  const { data: allEmployees } = useEmployees("installer");
  const { data: allAreas } = useServiceAreas();
  const { data: allAddons } = useAddonServices();

  const offerLines = offer.sales_offer_line_items || [];
  const primaryServiceLine = offerLines.find((li) => li.line_type === "service" && li.item_id);
  const primaryServiceId = primaryServiceLine?.item_id ?? null;

  // Resolve real duration per line item. Stored line-item duration is unreliable —
  // QuoteLineItemEditor historically dropped it, so fall back to the underlying
  // service/addon row in services / addon_services.
  const totalDurationMinutes = useMemo(() => {
    return offerLines.reduce((sum, li) => {
      const qty = li.quantity || 1;

      if (li.line_type === "service" && li.item_id) {
        const svc = allServices?.find((s) => s.id === li.item_id);
        if (svc) {
          const base = svc.duration_minutes;
          const extra = svc.extra_duration_per_unit_minutes ?? null;
          const dur = qty > 1 && extra != null ? base + (qty - 1) * extra : base * qty;
          return sum + dur;
        }
      }

      if (li.line_type === "additional_service" && li.item_id) {
        const addon = allAddons?.find((a) => a.id === li.item_id);
        if (addon) return sum + addon.duration_minutes * qty;
      }

      // For products / other_charge / unresolved items: fall back to whatever the
      // line item itself stores (wizard-built offers store this; QuoteBuilder doesn't).
      return sum + (li.duration_minutes || 0) * qty;
    }, 0);
  }, [offerLines, allServices, allAddons]);

  const durationResolved = totalDurationMinutes > 0;
  const totalCents = Math.round(Number(offer.total) * 100);
  const postalCode = offer.customer_postcode || opportunity.postcode || "";
  const address = offer.customer_address || opportunity.address || "";

  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  async function handleSubmit() {
    if (!selectedDate || !selectedTime || !selectedEmployeeId) return;
    if (!durationResolved) {
      toast("Tarjouksen kestoa ei pystytä laskemaan — tarkista palvelurivit", "error");
      return;
    }
    setIsSubmitting(true);
    try {
      const name = (offer.customer_name || opportunity.name || "").trim();
      const parts = name.split(/\s+/);
      const firstName = parts[0] || null;
      const lastName = parts.slice(1).join(" ") || null;

      const lineItems = offerLines.map((li) => ({
        line_type:
          li.line_type === "additional_service"
            ? ("addon_service" as const)
            : li.line_type === "product"
            ? ("product" as const)
            : ("custom" as const),
        addon_service_id: li.line_type === "additional_service" ? li.item_id || undefined : undefined,
        product_id: li.line_type === "product" ? li.item_id || undefined : undefined,
        name: li.name,
        price_cents: Math.round(Number(li.unit_price) * 100),
        quantity: li.quantity,
        duration_minutes: li.duration_minutes || 0,
        material_cost_cents: 0,
      }));

      const { data, error } = await supabase.functions.invoke("create-admin-booking", {
        body: {
          customer: {
            first_name: firstName,
            last_name: lastName,
            email: offer.customer_email || opportunity.email || null,
            phone: offer.customer_phone || opportunity.phone || null,
            postal_code: postalCode,
            address,
          },
          booking: {
            service_id: primaryServiceId,
            employee_id: selectedEmployeeId,
            calendar_id: selectedCalendarId,
            price_cents: totalCents,
            device_count: 1,
            unit_price_cents: totalCents,
            service_label: offer.title || primaryServiceLine?.name || "Tarjouksen mukainen työ",
            duration_minutes: totalDurationMinutes,
            booking_date: selectedDate,
            time_slot: selectedTime,
            postal_code: postalCode || null,
            address: address || null,
            lead_source: "sales_offer",
            opportunity_id: opportunity.id,
            offer_id: offer.id,
          },
          line_items: lineItems.length > 0 ? lineItems : undefined,
          skip_notifications: !sendConfirmation,
        },
      });
      if (error) throw error;
      toast(`Varaus luotu #${(data as { bookingNumber: string }).bookingNumber}`);
      onSuccess();
    } catch (err) {
      console.error(err);
      toast("Varauksen luominen epäonnistui", "error");
    } finally {
      setIsSubmitting(false);
    }
  }

  const canProceed = !!selectedDate && !!selectedTime && !!selectedEmployeeId && !isSubmitting && durationResolved;

  return (
    <div ref={rootRef} className="bg-surface rounded-2xl border-2 border-border p-6 mb-6 scroll-mt-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-semibold text-text-primary">
          Tee varaus tarjouksesta #{offer.offer_number || "–"}
        </h2>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-surface-hover transition-colors">
          <X className="w-4 h-4 text-text-muted" />
        </button>
      </div>

      <div className="mb-4 rounded-xl border border-border bg-muted/20 px-3 py-2.5 text-xs space-y-1">
        <div className="font-medium text-text-primary">
          {offer.title || `Tarjous #${offer.offer_number || "–"}`}
        </div>
        <div className="text-text-muted">
          Asiakas: {offer.customer_name || opportunity.name || "–"}
          {address && ` · ${address}`}
        </div>
        <div className="text-text-muted">
          {offerLines.length} rivi{offerLines.length === 1 ? "" : "ä"} · Kesto {totalDurationMinutes} min · Yhteensä {Number(offer.total).toFixed(2)} €
        </div>
        {!durationResolved && (
          <div className="text-red-600 font-medium">
            ⚠ Kestoa ei pystytä laskemaan — palvelurivien duration_minutes on 0 eikä item_id viittaa tunnettuun palveluun. Korjaa tarjous ennen varausta.
          </div>
        )}
      </div>

      <CalendarStep
        path={postalCode ? "postal" : "free"}
        postalCode={postalCode}
        selectedServiceIds={primaryServiceId ? [primaryServiceId] : []}
        allServices={allServices || []}
        allEmployees={allEmployees || []}
        allAreas={allAreas || []}
        selectedEmployeeId={selectedEmployeeId}
        setSelectedEmployeeId={setSelectedEmployeeId}
        selectedCalendarId={selectedCalendarId}
        setSelectedCalendarId={setSelectedCalendarId}
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        selectedTime={selectedTime}
        setSelectedTime={setSelectedTime}
        calMonth={calMonth}
        setCalMonth={setCalMonth}
        totalDuration={totalDurationMinutes}
        minSchedulingNoticeHours={0}
        onBack={onClose}
        onNext={handleSubmit}
        canProceed={canProceed}
        isSubmitting={isSubmitting}
        backLabel="Peruuta"
        nextLabel="Luo varaus"
      />

      <label className="flex items-center gap-2 mt-4 text-sm text-text-secondary cursor-pointer select-none">
        <input
          type="checkbox"
          checked={sendConfirmation}
          onChange={(e) => setSendConfirmation(e.target.checked)}
          className="rounded border-border text-accent accent-accent-dark"
        />
        Lähetä vahvistus asiakkaalle
      </label>
    </div>
  );
}
