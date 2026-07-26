import { useRef, useState } from "react";
import { CameraView } from "@/components/BarcodeScanner";
import { beep } from "@/lib/scanFeedback";
import {
  findInStockUnitBySerial,
  useAllocateScannedUnit,
  useAllocationBoard,
  type ScannedUnit,
  type BookingNeed,
} from "@/hooks/useAllocation";
import { openInventoryLabelPdf } from "@/lib/chromiumPdf";
import { useToast } from "@/context/ToastContext";
import { X, ScanLine, Package, Calendar, User, MapPin, Printer, Check } from "lucide-react";

/**
 * Scan a device's serial at the pallet → it resolves the in-stock unit → pick the
 * upcoming booking that needs it → the unit is reserved (split boxes auto-paired)
 * and its label opens for printing. Repeat for the next box.
 */
export function ScanAllocateDialog({ onClose }: { onClose: () => void }) {
  const toast = useToast();
  const { data: needs } = useAllocationBoard();
  const allocate = useAllocateScannedUnit();

  // The unit just scanned, waiting for a booking to be picked.
  const [scanned, setScanned] = useState<ScannedUnit | null>(null);
  const [autoPrint, setAutoPrint] = useState(true);
  const [recent, setRecent] = useState<string[]>([]); // serials handled this session

  const busyRef = useRef(false);
  const pendingRef = useRef(false); // a unit is awaiting booking selection

  const handleScan = async (code: string) => {
    if (busyRef.current || pendingRef.current) return;
    busyRef.current = true;
    try {
      const unit = await findInStockUnitBySerial(code);
      if (!unit) {
        toast.error(`Ei vapaata yksikköä: ${code}`);
        return;
      }
      beep();
      pendingRef.current = true;
      setScanned(unit);
    } catch {
      toast.error("Haku epäonnistui");
    } finally {
      busyRef.current = false;
    }
  };

  // Bookings that still need the scanned unit's bundle product, soonest first.
  const matches: BookingNeed[] = scanned
    ? (needs || []).filter((n) =>
        n.lines.some((l) => l.product.id === scanned.bundle.id && l.remaining > 0),
      )
    : [];

  const pickBooking = async (need: BookingNeed) => {
    if (!scanned) return;
    try {
      await allocate.mutateAsync({
        unit: scanned,
        bookingId: need.bookingId,
        employeeId: need.employeeId,
        bookingDate: need.bookingDate,
      });
      toast.success(`${scanned.productName} → ${need.customerName}`);
      setRecent((r) => [scanned.serial || scanned.id.slice(0, 6), ...r].slice(0, 8));
      if (autoPrint) {
        openInventoryLabelPdf(need.bookingId, { unit_id: scanned.id }).catch(() =>
          toast.error("Tarran avaus epäonnistui"),
        );
      }
    } catch {
      toast.error("Kohdistus epäonnistui");
    } finally {
      setScanned(null);
      pendingRef.current = false;
    }
  };

  const cancelPick = () => {
    setScanned(null);
    pendingRef.current = false;
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md max-h-[94vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <ScanLine className="w-4 h-4 text-accent flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold text-text-primary truncate">Skannaa & kohdista</h3>
              <p className="text-xs text-text-muted truncate">
                Skannaa laitteen sarjanumero, valitse keikka
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-hover transition-colors flex-shrink-0">
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        {/* Camera */}
        <div className="relative bg-black h-56 flex-shrink-0">
          <CameraView onDetected={handleScan} />
        </div>

        {/* Auto-print toggle */}
        <label className="px-5 py-2.5 border-b border-border flex items-center gap-2 text-xs text-text-secondary cursor-pointer">
          <input
            type="checkbox"
            checked={autoPrint}
            onChange={(e) => setAutoPrint(e.target.checked)}
            className="accent-accent"
          />
          <Printer className="w-3.5 h-3.5 text-text-muted" />
          Avaa tarra automaattisesti kohdistuksen jälkeen
        </label>

        {/* Body: either the booking picker for the scanned unit, or recent activity */}
        <div className="px-5 py-3 overflow-y-auto flex-1">
          {scanned ? (
            <div>
              <div className="rounded-xl border border-accent/40 bg-accent-muted/40 p-3 mb-3">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-accent flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text-primary truncate">
                      {scanned.bundle.name}
                      {scanned.role && (
                        <span className="text-text-muted font-normal">
                          {" "}
                          · {scanned.role === "indoor" ? "Sisäyksikkö" : "Ulkoyksikkö"}
                        </span>
                      )}
                    </p>
                    <p className="text-[11px] text-text-muted font-mono">SN: {scanned.serial || "—"}</p>
                  </div>
                </div>
              </div>

              <p className="text-xs font-medium text-text-muted mb-2">
                Valitse keikka jolle laite kohdistetaan:
              </p>
              {matches.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  Ei tulevaa keikkaa joka tarvitsee tätä tuotetta. Laite jää varastoon.
                  <button onClick={cancelPick} className="block mt-2 text-amber-900 underline">
                    Peruuta skannaus
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {matches.map((need) => (
                    <button
                      key={need.bookingId}
                      onClick={() => pickBooking(need)}
                      disabled={allocate.isPending}
                      className="w-full text-left rounded-xl border border-border bg-surface-alt hover:bg-surface-hover p-3 transition-colors disabled:opacity-50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold text-text-primary truncate">
                          {need.customerName}
                        </span>
                        {need.bookingNumber != null && (
                          <span className="text-xs text-text-muted">#{need.bookingNumber}</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-text-muted mt-0.5">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(need.bookingDate + "T00:00:00").toLocaleDateString("fi-FI", {
                            weekday: "short",
                            day: "numeric",
                            month: "numeric",
                          })}
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
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div>
              {recent.length === 0 ? (
                <p className="text-center text-xs text-text-muted py-6">
                  Skannaa laitteen sarjanumero aloittaaksesi.
                </p>
              ) : (
                <>
                  <p className="text-xs font-medium text-text-muted mb-2">
                    Kohdistettu tässä istunnossa ({recent.length})
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {recent.map((sn, i) => (
                      <span
                        key={`${sn}-${i}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] font-mono text-emerald-800"
                      >
                        <Check className="w-3 h-3" />
                        {sn}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-text-secondary hover:bg-surface-hover rounded-xl transition-colors"
          >
            Valmis
          </button>
        </div>
      </div>
    </div>
  );
}
