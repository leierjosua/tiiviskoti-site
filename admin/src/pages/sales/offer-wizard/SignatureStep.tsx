import { useRef, useEffect } from "react";
import SignaturePad from "signature_pad";
import type { WizardAction } from "./types";
import { useToast } from "@/context/ToastContext";

interface Props {
  signerName: string;
  signatureDataUrl: string | null;
  customerName: string;
  dispatch: React.Dispatch<WizardAction>;
}

export function SignatureStep({ signerName, signatureDataUrl, customerName, dispatch }: Props) {
  const toast = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const padRef = useRef<SignaturePad | null>(null);

  // Initialize signer name from customer if empty
  useEffect(() => {
    if (!signerName && customerName) {
      dispatch({ type: "SET_FIELD", field: "signerName", value: customerName });
    }
  }, [customerName]); // eslint-disable-line react-hooks/exhaustive-deps

  const initCanvas = (el: HTMLCanvasElement | null) => {
    canvasRef.current = el;
    if (el && !padRef.current) {
      el.width = el.offsetWidth * 2;
      el.height = 300;
      const ctx = el.getContext("2d");
      if (ctx) ctx.scale(2, 2);
      padRef.current = new SignaturePad(el, {
        backgroundColor: "rgb(255, 255, 255)",
        penColor: "rgb(26, 26, 26)",
      });
    }
  };

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-text-primary">Allekirjoitus</h2>

      <div>
        <label className="block text-[10px] font-semibold text-text-muted uppercase tracking-wide mb-2">
          Allekirjoittajan nimi
        </label>
        <input
          className="w-full px-3.5 py-2.5 border border-border rounded-xl text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
          value={signerName}
          onChange={(e) => dispatch({ type: "SET_FIELD", field: "signerName", value: e.target.value })}
          placeholder="Allekirjoittajan nimi"
        />
      </div>

      {signatureDataUrl ? (
        <div className="space-y-2">
          <div className="border border-border rounded-xl p-2 bg-white">
            <img src={signatureDataUrl} alt="Allekirjoitus" className="w-full h-auto" />
          </div>
          <button
            onClick={() => {
              dispatch({ type: "SET_FIELD", field: "signatureDataUrl", value: null });
              padRef.current = null;
            }}
            className="text-xs text-red-500 hover:text-red-600 font-medium"
          >
            Allekirjoita uudelleen
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">Anna tabletti/puhelin asiakkaalle allekirjoitusta varten:</p>
          <div className="border-2 border-dashed border-border rounded-xl bg-white overflow-hidden">
            <canvas
              ref={initCanvas}
              className="w-full"
              style={{ height: "150px", touchAction: "none" }}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => padRef.current?.clear()}
              className="px-4 py-2.5 sm:px-3 sm:py-1.5 text-sm sm:text-xs font-medium text-text-muted border border-border rounded-lg hover:bg-bg-secondary"
            >
              Tyhjennä
            </button>
            <button
              onClick={() => {
                if (padRef.current?.isEmpty()) {
                  toast.error("Allekirjoitus puuttuu");
                  return;
                }
                dispatch({ type: "SET_FIELD", field: "signatureDataUrl", value: padRef.current!.toDataURL("image/png") });
              }}
              className="px-4 py-2.5 sm:px-3 sm:py-1.5 text-sm sm:text-xs font-medium bg-accent text-white rounded-lg hover:bg-accent/90"
            >
              Hyväksy allekirjoitus
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
