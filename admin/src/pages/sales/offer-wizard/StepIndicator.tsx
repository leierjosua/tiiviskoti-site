import { Check } from "lucide-react";
import type { WizardStep, DeliveryMode } from "./types";

const BASE_STEPS: { key: WizardStep; label: string }[] = [
  { key: "customer", label: "Asiakastiedot" },
  { key: "devices", label: "Laitteet" },
  { key: "install_plan", label: "Asennussuunnitelma" },
  { key: "summary", label: "Yhteenveto" },
];

const SIGN_EXTRA: { key: WizardStep; label: string }[] = [
  { key: "signature", label: "Allekirjoitus" },
  { key: "booking", label: "Ajanvaraus" },
];

export function getVisibleSteps(deliveryMode: DeliveryMode | null) {
  if (deliveryMode === "sign_now" || deliveryMode === "sign_pending_confirm") {
    return [...BASE_STEPS, ...SIGN_EXTRA];
  }
  return BASE_STEPS;
}

interface Props {
  currentStep: WizardStep;
  deliveryMode: DeliveryMode | null;
  onStepClick: (step: WizardStep) => void;
}

export function StepIndicator({ currentStep, deliveryMode, onStepClick }: Props) {
  const steps = getVisibleSteps(deliveryMode);
  const currentIdx = steps.findIndex((s) => s.key === currentStep);

  if (currentStep === "confirmation") return null;

  return (
    <div className="flex items-center gap-2 mb-8 overflow-x-auto">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <button
            onClick={() => { if (i < currentIdx) onStepClick(s.key); }}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors flex-shrink-0 ${
              currentIdx > i
                ? "bg-accent text-white cursor-pointer"
                : currentIdx === i
                  ? "bg-brand text-white"
                  : "bg-border text-text-muted"
            }`}
          >
            {currentIdx > i ? <Check size={14} /> : i + 1}
          </button>
          {i < steps.length - 1 && <div className="w-6 h-px bg-border flex-shrink-0" />}
        </div>
      ))}
    </div>
  );
}
