import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Plus, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { useConfirm } from "@/context/ConfirmContext";
import {
  useProtocolTemplates,
  useProtocolsByBooking,
  useCreateProtocol,
  useDeleteProtocol,
} from "@/hooks/useProtocols";
import { useBookingLineItems } from "@/hooks/useBookingLineItems";
import ProtocolForm from "./ProtocolForm";
import type { Booking } from "@/lib/types";

interface ProtocolTabsProps {
  booking: Booking;
  backUrl: string;
}

export default function ProtocolTabs({ booking, backUrl }: ProtocolTabsProps) {
  const { data: protocols = [], isLoading } = useProtocolsByBooking(booking.id);
  const { data: templates } = useProtocolTemplates();
  const { data: lineItems } = useBookingLineItems(booking.id);
  const createProtocol = useCreateProtocol();
  const deleteProtocol = useDeleteProtocol();
  const confirm = useConfirm();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [manualTemplateId, setManualTemplateId] = useState<string | null>(null);

  const template = useMemo(() => {
    if (!templates) return null;
    // Match by service_id first
    if (booking.service_id) {
      const match = templates.find((t) => t.service_id === booking.service_id);
      if (match) return match;
    }
    // Fallback: match huoltopesu variants (e.g. "Huoltopesu, 1 yksikkö") by slug
    const serviceName = booking.services?.name;
    if (serviceName) {
      if (/^Huoltopesu/i.test(serviceName)) {
        const match = templates.find((t) => t.slug === "huoltopesu");
        if (match) return match;
      }
    }
    // Manual selection
    if (manualTemplateId) {
      return templates.find((t) => t.id === manualTemplateId) || null;
    }
    return null;
  }, [templates, booking.service_id, booking.services?.name, manualTemplateId]);

  // Select first protocol by default once loaded
  const activeId = selectedId ?? protocols[0]?.id ?? null;

  // Whether the service has a direct template match (vs manual selection)
  // NOTE: must be before the early return so hook order is stable
  const hasServiceTemplate = useMemo(() => {
    if (!templates) return false;
    if (booking.service_id && templates.some((t) => t.service_id === booking.service_id)) {
      return true;
    }
    const serviceName = booking.services?.name;
    if (serviceName && /^Huoltopesu/i.test(serviceName)) {
      return templates.some((t) => t.slug === "huoltopesu");
    }
    return false;
  }, [templates, booking.service_id, booking.services?.name]);

  // If no protocols yet, render ProtocolForm directly (it auto-creates)
  if (!isLoading && protocols.length === 0) {
    return (
      <ProtocolForm
        booking={booking}
        backUrl={backUrl}
        onProtocolCreated={(id) => setSelectedId(id)}
      />
    );
  }

  async function handleCreateNew(overrideTemplate?: typeof template) {
    const tmpl = overrideTemplate || template;
    if (!tmpl || creating) return;
    setCreating(true);
    try {
      const nextSeq = protocols.length > 0
        ? Math.max(...protocols.map((p) => p.sequence_number)) + 1
        : 1;

      // Build defaults from template
      const defaults: Record<string, string | number | boolean> = {};
      for (const section of tmpl.sections) {
        for (const field of section.fields) {
          if (field.default_value !== undefined) {
            defaults[field.key] = field.default_value;
          }
        }
      }

      // Pre-fill manufacturer and model from booking line items
      const productItem = (lineItems || []).find((li) => li.products?.brand || li.products?.model);
      if (productItem?.products) {
        if (productItem.products.brand) defaults.manufacturer = productItem.products.brand;
        if (productItem.products.model) defaults.model = productItem.products.model;
      }

      const data = await createProtocol.mutateAsync({
        booking_id: booking.id,
        template_id: tmpl.id,
        sequence_number: nextSeq,
        field_data: defaults,
      });
      setSelectedId(data.id);
    } finally {
      setCreating(false);
    }
  }

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-6 bg-border rounded w-48" />
        <div className="h-64 bg-surface rounded-2xl" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Back link */}
      <Link
        to={backUrl}
        className="inline-flex items-center gap-1 text-sm text-text-muted hover:text-text-primary mb-4"
      >
        <ArrowLeft className="w-4 h-4" /> Takaisin
      </Link>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-border mb-6 overflow-x-auto">
        {protocols.map((p) => {
          const isActive = p.id === activeId;
          const isCompleted = p.status === "completed";
          return (
            <button
              key={p.id}
              onClick={() => setSelectedId(p.id)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                isActive
                  ? "border-accent text-accent"
                  : "border-transparent text-text-secondary hover:text-text-primary"
              }`}
            >
              {isCompleted && (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
              )}
              {!isCompleted && (
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
              )}
              Pöytäkirja {p.sequence_number}
            </button>
          );
        })}

        {/* Create new button — direct if service has template, selector otherwise */}
        {hasServiceTemplate && template && (
          <button
            onClick={() => handleCreateNew()}
            disabled={creating}
            className="flex items-center gap-1 px-3 py-2.5 text-sm font-medium text-text-muted hover:text-accent border-b-2 border-transparent transition-colors whitespace-nowrap"
          >
            {creating ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Luo uusi
          </button>
        )}
        {!hasServiceTemplate && templates && templates.length > 0 && (
          <div className="flex items-center gap-1.5 px-2 py-1 border-b-2 border-transparent">
            <select
              className="text-sm border border-border rounded-lg px-2 py-1.5 bg-white text-text-secondary"
              value={manualTemplateId || ""}
              onChange={(e) => setManualTemplateId(e.target.value || null)}
            >
              <option value="">Valitse pohja...</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <button
              onClick={() => handleCreateNew()}
              disabled={creating || !manualTemplateId}
              className="flex items-center gap-1 px-2.5 py-1.5 text-sm font-medium text-text-muted hover:text-accent transition-colors whitespace-nowrap disabled:opacity-40"
            >
              {creating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Plus className="w-3.5 h-3.5" />
              )}
              Luo
            </button>
          </div>
        )}
      </div>

      {/* Protocol form for selected tab */}
      {activeId && (
        <>
          {protocols.length > 1 && (() => {
            const activeProtocol = protocols.find((p) => p.id === activeId);
            return activeProtocol && activeProtocol.status !== "completed" ? (
              <div className="flex justify-end mb-4">
                <button
                  onClick={async () => {
                    if (!await confirm({ message: `Poistetaanko Pöytäkirja ${activeProtocol.sequence_number}?`, confirmLabel: "Poista", variant: "danger" })) return;
                    await deleteProtocol.mutateAsync({ id: activeId, bookingId: booking.id });
                    setSelectedId(null);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Poista pöytäkirja
                </button>
              </div>
            ) : null;
          })()}
          <ProtocolForm
            key={activeId}
            booking={booking}
            backUrl={backUrl}
            protocolId={activeId}
          />
        </>
      )}
    </div>
  );
}
