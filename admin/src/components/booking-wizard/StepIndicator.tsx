import { Check } from "lucide-react";

interface StepIndicatorProps {
  labels: string[];
  currentStep: number;
  onStepClick?: (step: number) => void;
  useCheckIcon?: boolean;
}

export function StepIndicator({ labels, currentStep, onStepClick, useCheckIcon = false }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-2 mb-8 overflow-x-auto">
      {labels.map((label, i) => (
        <div key={i} className="flex items-center gap-2">
          <button
            onClick={() => { if (i < currentStep && onStepClick) onStepClick(i); }}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors flex-shrink-0 ${
              currentStep > i ? "bg-accent text-white cursor-pointer" : currentStep === i ? "bg-brand text-white" : "bg-border text-text-muted"
            }`}
          >
            {useCheckIcon && currentStep > i ? <Check className="w-4 h-4" /> : i + 1}
          </button>
          <span className={`text-xs whitespace-nowrap ${currentStep === i ? "font-semibold text-text-primary" : "text-text-muted"}`}>{label}</span>
          {i < labels.length - 1 && <div className="w-6 h-px bg-border flex-shrink-0" />}
        </div>
      ))}
    </div>
  );
}
