import type { InstallPlan, WizardAction } from "./types";
import { INSTALL_PLAN_OPTIONS } from "@/lib/installPlanText";

const labelCls = "block text-xs font-semibold text-text-muted uppercase tracking-wide mb-2";

interface Props {
  installPlan: InstallPlan;
  dispatch: React.Dispatch<WizardAction>;
  onNext: () => void;
  onBack: () => void;
}

type RadioOption<K extends keyof InstallPlan> = {
  value: NonNullable<InstallPlan[K]>;
  label: string;
  desc: string;
};

function RadioGroup<K extends keyof InstallPlan>({
  field,
  label,
  options,
  current,
  cols,
  dispatch,
}: {
  field: K;
  label: string;
  options: readonly RadioOption<K>[];
  current: InstallPlan[K];
  cols: string;
  dispatch: React.Dispatch<WizardAction>;
}) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      <div className={`grid ${cols} gap-2`}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => dispatch({ type: "SET_INSTALL_PLAN", field, value: opt.value })}
            className={`border rounded-xl p-3 text-left transition-colors ${current === opt.value ? "border-brand bg-brand/5" : "border-border hover:border-border/80"}`}
          >
            <p className="text-sm font-semibold">{opt.label}</p>
            <p className="text-[10px] text-text-muted mt-0.5">{opt.desc}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

export function InstallPlanStep({ installPlan, dispatch, onNext, onBack }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-text-primary">Asennussuunnitelma</h2>
        <p className="text-sm text-text-muted mt-1">Valitse asennuksen toteutustapa. Tiedot liitetään tarjoukseen.</p>
      </div>

      <RadioGroup
        field="lapivienti"
        label="Läpivienti"
        current={installPlan.lapivienti}
        dispatch={dispatch}
        cols="grid-cols-1 sm:grid-cols-2"
        options={INSTALL_PLAN_OPTIONS.lapivienti as readonly RadioOption<"lapivienti">[]}
      />

      <RadioGroup
        field="teline"
        label="Ulkoyksikön teline"
        current={installPlan.teline}
        dispatch={dispatch}
        cols="grid-cols-1 sm:grid-cols-3"
        options={INSTALL_PLAN_OPTIONS.teline as readonly RadioOption<"teline">[]}
      />

      <RadioGroup
        field="sahko"
        label="Sähkökytkentä"
        current={installPlan.sahko}
        dispatch={dispatch}
        cols="grid-cols-1 sm:grid-cols-2"
        options={INSTALL_PLAN_OPTIONS.sahko as readonly RadioOption<"sahko">[]}
      />

      <RadioGroup
        field="kondenssi"
        label="Kondenssivesi"
        current={installPlan.kondenssi}
        dispatch={dispatch}
        cols="grid-cols-1 sm:grid-cols-2"
        options={INSTALL_PLAN_OPTIONS.kondenssi as readonly RadioOption<"kondenssi">[]}
      />

      <div>
        <label className={labelCls}>Lisätiedot / kohdekohtaiset huomiot</label>
        <textarea
          value={installPlan.huomiot ?? ""}
          onChange={(e) => dispatch({ type: "SET_INSTALL_PLAN", field: "huomiot", value: e.target.value })}
          placeholder="Esim. Ulkoyksikkö kiinnitetään sokkeliin, ei seinään. Taloyhtiön lupa hankittu."
          rows={4}
          className="w-full border border-border rounded-xl p-3 text-sm focus:outline-none focus:border-brand"
        />
      </div>

      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold border border-border bg-surface text-text-primary hover:bg-gray-50 transition-colors"
        >
          Takaisin
        </button>
        <button
          onClick={onNext}
          className="px-6 py-2.5 bg-accent text-white rounded-xl font-semibold hover:bg-accent/90 transition-colors"
        >
          Jatka
        </button>
      </div>
    </div>
  );
}
