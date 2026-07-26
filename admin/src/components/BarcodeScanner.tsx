import { useEffect, useRef, useState, useCallback } from "react";
import {
  MultiFormatReader,
  BinaryBitmap,
  HybridBinarizer,
  DecodeHintType,
  BarcodeFormat,
} from "@zxing/library";
import { HTMLCanvasElementLuminanceSource } from "@zxing/browser";
import { X, Check, ScanLine, CameraOff, Flashlight } from "lucide-react";
import { beep } from "@/lib/scanFeedback";

// Restrict to the formats actually printed on HVAC boxes/labels — faster + fewer misreads.
const FORMATS = [
  BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8,
  BarcodeFormat.CODE_128,
  BarcodeFormat.CODE_39,
  BarcodeFormat.QR_CODE,
  BarcodeFormat.DATA_MATRIX,
  BarcodeFormat.ITF,
  BarcodeFormat.UPC_A,
  BarcodeFormat.UPC_E,
];

// Floor between accepting the same code twice — stops 30fps duplicate-frame floods.
const FLOOD_MS = 800;
// Decode only this centred region of the camera frame (fraction of width/height),
// matching the on-screen aiming box — so an adjacent barcode (e.g. the serial next
// to the model code) outside the box is NOT decoded.
const ROI_W = 0.9;
const ROI_H = 0.42;
// How often to grab a frame and decode (ms). ~11 fps is plenty and easy on the CPU.
const DECODE_INTERVAL_MS = 90;

// ─── CameraView: the camera + decode surface (no chrome) ───────────────────────
// Owns getUserMedia/zxing/playback/torch/errors. Starts once and stops the camera
// tracks reliably on unmount so re-opening always works. Calls onDetected for each
// distinct read (flood-gated); semantic de-duplication is the caller's job.

export function CameraView({ onDetected }: { onDetected: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSeenRef = useRef<Map<string, number>>(new Map());
  const onDetectedRef = useRef(onDetected);
  useEffect(() => {
    onDetectedRef.current = onDetected;
  });

  const [error, setError] = useState<string | null>(null);
  const [needsTap, setNeedsTap] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  // Detected-but-not-yet-confirmed code. Decoding pauses while this is set so the
  // user reviews one read at a time instead of a continuous stream.
  const [pending, setPending] = useState<string | null>(null);
  const pendingRef = useRef<string | null>(null);
  const resumeRef = useRef<(() => void) | null>(null);

  const acceptPending = useCallback(() => {
    const code = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    if (code) onDetectedRef.current(code);
    resumeRef.current?.();
  }, []);

  const rescan = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
    resumeRef.current?.();
  }, []);

  const startPlayback = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    try {
      await v.play();
      setNeedsTap(false);
    } catch {
      setNeedsTap(true);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    let stream: MediaStream | null = null;
    let timer: number | undefined;
    const videoEl = videoRef.current;

    const reader = new MultiFormatReader();
    reader.setHints(
      new Map<DecodeHintType, unknown>([
        [DecodeHintType.POSSIBLE_FORMATS, FORMATS],
        // Spend more effort per frame — needed to resolve long, dense Code39
        // model barcodes (e.g. RAS-B13S4KVG-E).
        [DecodeHintType.TRY_HARDER, true],
      ]),
    );

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    // Grab a frame, crop to the centred ROI, decode only that region.
    const tick = () => {
      if (cancelled) return;
      const v = videoRef.current;
      if (v && ctx && v.readyState >= 2 && v.videoWidth > 0) {
        const vw = v.videoWidth;
        const vh = v.videoHeight;
        const roiW = Math.round(vw * ROI_W);
        const roiH = Math.round(vh * ROI_H);
        const sx = Math.round((vw - roiW) / 2);
        const sy = Math.round((vh - roiH) / 2);
        if (canvas.width !== roiW) canvas.width = roiW;
        if (canvas.height !== roiH) canvas.height = roiH;
        ctx.drawImage(v, sx, sy, roiW, roiH, 0, 0, roiW, roiH);
        try {
          const source = new HTMLCanvasElementLuminanceSource(canvas);
          const bitmap = new BinaryBitmap(new HybridBinarizer(source));
          const result = reader.decode(bitmap);
          const code = result.getText().trim();
          if (code) {
            const now = Date.now();
            const last = lastSeenRef.current.get(code) ?? 0;
            if (now - last >= FLOOD_MS) {
              lastSeenRef.current.set(code, now);
              beep();
              pendingRef.current = code;
              setPending(code);
              return; // pause decoding until the user confirms or rescans
            }
          }
        } catch {
          /* no barcode in the ROI this frame */
        } finally {
          reader.reset();
        }
      }
      timer = window.setTimeout(tick, DECODE_INTERVAL_MS);
    };

    // Lets the confirm overlay restart the decode loop after accept / rescan.
    resumeRef.current = () => {
      if (!cancelled) timer = window.setTimeout(tick, DECODE_INTERVAL_MS);
    };

    (async () => {
      // Camera APIs only exist in a secure context (https or localhost).
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        setError(
          `Kamera vaatii suojatun yhteyden (https tai localhost). Nyt: ${window.location.protocol}//${window.location.host}`,
        );
        return;
      }

      // iOS Safari blocks autoplay unless these are set BEFORE the stream attaches.
      const v = videoRef.current;
      if (v) {
        v.setAttribute("playsinline", "true");
        v.setAttribute("autoplay", "true");
        v.muted = true;
        v.defaultMuted = true;
      }

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            // High resolution so dense/long barcodes resolve when held close.
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        if (!v) return;
        v.srcObject = stream;

        const track = stream.getVideoTracks()[0];
        const caps = track?.getCapabilities?.() as { torch?: boolean } | undefined;
        if (caps?.torch) setTorchSupported(true);

        try {
          await v.play();
        } catch {
          /* fall through to paused check */
        }
        if (v.paused) setNeedsTap(true);

        tick();
      } catch (e) {
        if (cancelled) return;
        const name = (e as Error)?.name;
        const msg = (e as Error)?.message || "";
        if (name === "NotAllowedError") {
          setError("Kameran käyttö estetty. Salli kamera selaimen asetuksista ja lataa sivu uudelleen.");
        } else if (name === "NotReadableError") {
          setError("Kamera on toisen sovelluksen käytössä. Sulje muut kameraa käyttävät sovellukset.");
        } else if (name === "NotFoundError" || name === "OverconstrainedError") {
          setError("Kameraa ei löytynyt tästä laitteesta.");
        } else {
          setError(`Kameran käynnistys epäonnistui (${name || "tuntematon virhe"}): ${msg}`);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
      const s = videoEl?.srcObject as MediaStream | null;
      s?.getTracks().forEach((t) => t.stop());
      if (videoEl) videoEl.srcObject = null;
    };
  }, []);

  const toggleTorch = async () => {
    const stream = videoRef.current?.srcObject as MediaStream | null;
    const track = stream?.getVideoTracks()[0];
    if (!track) return;
    try {
      const next = !torchOn;
      await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] });
      setTorchOn(next);
    } catch {
      /* torch not toggleable */
    }
  };

  if (error) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
        <CameraOff className="w-8 h-8 text-white/60" />
        <p className="text-sm text-white/80">{error}</p>
      </div>
    );
  }

  return (
    <>
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        autoPlay
        muted
        onPlaying={() => setNeedsTap(false)}
      />
      {needsTap && (
        <button
          onClick={startPlayback}
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white"
        >
          <ScanLine className="w-8 h-8" />
          <span className="text-sm font-semibold">Käynnistä kamera</span>
        </button>
      )}
      {/* Aiming frame — matches the decoded ROI (ROI_W × ROI_H). Only what's inside
          is read, so keep a single barcode here and the adjacent one outside. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <div className="w-[90%] h-[42%] border-2 border-white/80 rounded-xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)]" />
      </div>
      {torchSupported && !pending && (
        <button
          onClick={toggleTorch}
          className={`absolute bottom-3 right-3 p-2.5 rounded-full backdrop-blur transition-colors ${
            torchOn ? "bg-amber-400 text-black" : "bg-black/40 text-white"
          }`}
          title="Taskulamppu"
        >
          <Flashlight className="w-4 h-4" />
        </button>
      )}

      {/* Confirm overlay — decoding is paused; user accepts or rescans. */}
      {pending && (
        <div className="absolute inset-x-0 bottom-0 p-3 bg-black/80 backdrop-blur flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-white/60">Havaittu</p>
            <p className="text-sm font-mono text-white truncate">{pending}</p>
          </div>
          <button
            onClick={rescan}
            className="px-3 py-2 rounded-xl bg-white/15 text-white text-sm font-semibold hover:bg-white/25 transition-colors"
          >
            Uudelleen
          </button>
          <button
            onClick={acceptPending}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-accent text-white text-sm font-semibold hover:bg-accent-dark transition-colors"
          >
            <Check className="w-4 h-4" />
            Hyväksy
          </button>
        </div>
      )}
    </>
  );
}

// ─── BarcodeScanner: modal wrapper around CameraView ───────────────────────────

type ScanMode = "single" | "accumulate" | "repeat";

interface BarcodeScannerProps {
  title?: string;
  hint?: string;
  /**
   * "single"     → close after the first scan (search / single field).
   * "accumulate" → collect unique codes; a code already seen is ignored (serial numbers).
   * "repeat"     → allow the same code again after a short cooldown (counting boxes).
   */
  mode?: ScanMode;
  /** Seed the accumulated list (e.g. serials already typed in). */
  initialCodes?: string[];
  /** Fired for every accepted scan. `allScanned` is the authoritative full list. */
  onDetected: (code: string, allScanned: string[]) => void;
  onClose: () => void;
}

const REPEAT_COOLDOWN_MS = 1500;

export function BarcodeScanner({
  title = "Skannaa viivakoodi",
  hint,
  mode = "accumulate",
  initialCodes = [],
  onDetected,
  onClose,
}: BarcodeScannerProps) {
  const scannedRef = useRef<string[]>([...initialCodes]);
  const lastFireRef = useRef<Map<string, number>>(new Map());
  const [scanned, setScanned] = useState<string[]>([...initialCodes]);
  const [flash, setFlash] = useState<string | null>(null);

  const handle = useCallback(
    (code: string) => {
      const now = Date.now();
      if (mode === "accumulate") {
        if (scannedRef.current.includes(code)) {
          setFlash(`Jo lisätty: ${code}`);
          return;
        }
      } else if (mode === "repeat") {
        const last = lastFireRef.current.get(code) ?? 0;
        if (now - last < REPEAT_COOLDOWN_MS) return;
      }
      lastFireRef.current.set(code, now);

      const next = [...scannedRef.current, code];
      scannedRef.current = next;
      setScanned(next);
      setFlash(code);
      beep();
      onDetected(code, next);
      if (mode === "single") onClose();
    },
    [mode, onDetected, onClose],
  );

  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), 1200);
    return () => clearTimeout(t);
  }, [flash]);

  return (
    <div
      className="fixed inset-0 bg-black/70 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-surface rounded-2xl border border-border shadow-xl w-full max-w-md overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-2 min-w-0">
            <ScanLine className="w-4 h-4 text-accent flex-shrink-0" />
            <div className="min-w-0">
              <h3 className="font-semibold text-text-primary truncate">{title}</h3>
              {hint && <p className="text-xs text-text-muted truncate">{hint}</p>}
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-surface-hover transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-text-muted" />
          </button>
        </div>

        <div className="relative bg-black aspect-[4/3]">
          <CameraView onDetected={handle} />
          {flash && (
            <div className="absolute bottom-3 left-3 max-w-[60%] px-3 py-1.5 rounded-lg bg-emerald-500/90 text-white text-xs font-mono shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-150 truncate">
              {flash}
            </div>
          )}
        </div>

        {mode !== "single" && (
          <div className="px-5 py-3 border-t border-border flex items-center justify-between gap-3">
            <p className="text-xs text-text-muted">
              {scanned.length > initialCodes.length
                ? `Skannattu ${scanned.length - initialCodes.length} kpl`
                : "Suuntaa kamera viivakoodiin"}
            </p>
            <button
              onClick={onClose}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-accent hover:bg-accent-dark text-white rounded-xl text-sm font-semibold transition-colors"
            >
              <Check className="w-4 h-4" />
              Valmis
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
