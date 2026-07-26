import { useState } from "react";
import { Link } from "react-router-dom";
import { useAllocationBoard, useAllocateFromStock, type BookingNeed } from "@/hooks/useAllocation";
import { openInventoryLabelPdf, openInventoryLabelsPdf } from "@/lib/chromiumPdf";
import { ScanAllocateDialog } from "@/components/inventory/ScanAllocateDialog";
import { useToast } from "@/context/ToastContext";
import {
  Package,
  Printer,
  Calendar,
  User,
  MapPin,
  Check,
  Boxes,
  PackageCheck,
  ScanLine,
} from "lucide-react";

export function AllocationTab() {
  const { data: needs, isLoading } = useAllocationBoard();
  const allocate = useAllocateFromStock();
  const toast = useToast();
  const [scanOpen, setScanOpen] = useState(false);

  // Bookings allocated during this session — kept for the batch "print all" action
  // even after they drop off the board (fully assigned).
  const [allocatedIds, setAllocatedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleAllocate = async (need: BookingNeed, print: boolean) => {
    setBusyId(need.bookingId);
    try {
      let total = 0;
      for (const line of need.lines) {
        if (line.fulfillable > 0) {
          const n = await allocate.mutateAsync({
            bookingId: need.bookingId,
            employeeId: need.employeeId,
            bookingDate: need.bookingDate,
            product: line.product,
            count: line.fulfillable,
          });
          total += n;
        }
      }
      if (total > 0) {
        setAllocatedIds((prev) => new Set(prev).add(need.bookingId));
        toast.success(`Kohdistettu ${total} ${total === 1 ? "yksikkö" : "yksikköä"}`);
        if (print) {
          try {
            await openInventoryLabelPdf(need.bookingId);
          } catch {
            toast.error("Tarran avaus epäonnistui");
          }
        }
      } else {
        toast.info("Ei vapaita yksiköitä kohdistettavaksi");
      }
    } catch {
      toast.error("Kohdistus epäonnistui");
    } finally {
      setBusyId(null);
    }
  };

  const handlePrintAll = async () => {
    const ids = [...allocatedIds];
    if (ids.length === 0) return;
    try {
      await openInventoryLabelsPdf(ids);
    } catch {
      toast.error("Tarrojen tulostus epäonnistui");
    }
  };

  return (
    <div className="space-y-3">
      {/* Header: scan-to-allocate is always available, plus batch print */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-text-muted">
          {needs && needs.length > 0
            ? `${needs.length} ${needs.length === 1 ? "varaus tarvitsee" : "varausta tarvitsee"} laitteita — kohdista vapaa varasto ja tulosta tarrat.`
            : "Skannaa laite lavalta ja kohdista se suoraan keikalle."}
        </p>
        <div className="flex items-center gap-2">
          {allocatedIds.size > 0 && (
            <button
              onClick={handlePrintAll}
              className="inline-flex items-center gap-2 px-3 py-2 bg-surface border border-border hover:bg-surface-hover text-text-primary rounded-xl text-sm font-semibold transition-colors whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              Printtaa kaikki ({allocatedIds.size})
            </button>
          )}
          <button
            onClick={() => setScanOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors whitespace-nowrap"
          >
            <ScanLine className="w-4 h-4" />
            Skannaa & kohdista
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">
          Ladataan…
        </div>
      ) : !needs || needs.length === 0 ? (
        <div className="bg-surface rounded-2xl border border-border p-8 text-center text-text-muted">
          <PackageCheck className="w-8 h-8 mx-auto mb-2 text-text-muted/40" />
          Ei kohdistettavia tarpeita — kaikki tulevat varaukset on jo kohdistettu.
        </div>
      ) : (
        needs.map((need) => (
          <BookingNeedCard
            key={need.bookingId}
            need={need}
            busy={busyId === need.bookingId}
            onAllocate={(print) => handleAllocate(need, print)}
            onPrint={() => openInventoryLabelPdf(need.bookingId).catch(() => toast.error("Tarran avaus epäonnistui"))}
            wasAllocated={allocatedIds.has(need.bookingId)}
          />
        ))
      )}

      {scanOpen && <ScanAllocateDialog onClose={() => setScanOpen(false)} />}
    </div>
  );
}

function BookingNeedCard({
  need,
  busy,
  onAllocate,
  onPrint,
  wasAllocated,
}: {
  need: BookingNeed;
  busy: boolean;
  onAllocate: (print: boolean) => void;
  onPrint: () => void;
  wasAllocated: boolean;
}) {
  const date = new Date(need.bookingDate + "T00:00:00").toLocaleDateString("fi-FI", {
    weekday: "short",
    day: "numeric",
    month: "numeric",
  });

  return (
    <div className="bg-surface rounded-2xl border border-border p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Link
              to={`/bookings/${need.bookingId}`}
              className="text-sm font-semibold text-text-primary hover:text-accent"
            >
              {need.customerName}
            </Link>
            {need.bookingNumber != null && (
              <span className="text-xs text-text-muted">#{need.bookingNumber}</span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-muted mt-0.5">
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {date}
              {need.timeSlot ? ` klo ${need.timeSlot.slice(0, 5)}` : ""}
            </span>
            {need.installerName && (
              <span className="inline-flex items-center gap-1">
                <User className="w-3 h-3" />
                {need.installerName}
              </span>
            )}
            {(need.address || need.postalCode) && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {[need.address, need.postalCode].filter(Boolean).join(", ")}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Lines */}
      <div className="space-y-1.5 mb-3">
        {need.lines.map((line) => (
          <div
            key={line.lineId}
            className="flex items-center justify-between gap-3 text-xs rounded-lg bg-surface-alt px-3 py-2"
          >
            <div className="flex items-center gap-2 min-w-0">
              <Package className="w-3.5 h-3.5 text-text-muted flex-shrink-0" />
              <span className="text-text-primary truncate">{line.product.name}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-text-muted">
                {line.assigned}/{line.needed} kohdistettu
              </span>
              {line.remaining > 0 &&
                (line.fulfillable > 0 ? (
                  <span className="inline-flex items-center gap-1 text-emerald-700 font-medium">
                    <Boxes className="w-3 h-3" />
                    {line.availableSets} varastossa
                  </span>
                ) : (
                  <span className="text-amber-600 font-medium">ei varastossa</span>
                ))}
              {line.remaining === 0 && (
                <span className="inline-flex items-center gap-1 text-emerald-700">
                  <Check className="w-3 h-3" /> valmis
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        {wasAllocated && (
          <button
            onClick={onPrint}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-accent-muted text-accent-dark hover:bg-accent/20 transition-colors"
          >
            <Printer className="w-3.5 h-3.5" />
            Tarra
          </button>
        )}
        {need.anyFulfillable ? (
          <>
            <button
              onClick={() => onAllocate(false)}
              disabled={busy}
              className="px-3 py-2 text-xs font-medium text-text-secondary hover:bg-surface-hover rounded-lg transition-colors disabled:opacity-50"
            >
              Kohdista
            </button>
            <button
              onClick={() => onAllocate(true)}
              disabled={busy}
              className="inline-flex items-center gap-1.5 px-3 py-2 bg-accent hover:bg-accent-dark text-white rounded-lg text-xs font-semibold transition-colors disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              {busy ? "Kohdistetaan…" : "Kohdista & printtaa"}
            </button>
          </>
        ) : (
          <span className="text-[11px] text-text-muted self-center">
            Ei vapaata varastoa — tilattava
          </span>
        )}
      </div>
    </div>
  );
}
