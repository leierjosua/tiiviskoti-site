import { useMemo } from "react";
import { CalendarStep } from "@/components/CalendarStep";
import { useEmployees } from "@/hooks/useEmployees";
import { useServiceAreas } from "@/hooks/useServices";
import type { WizardState, WizardAction } from "./types";
import type { Service } from "@/lib/types";

interface Props {
  state: WizardState;
  dispatch: React.Dispatch<WizardAction>;
  allServices: Service[];
  selectedServiceIds: string[];
  /** Addon service IDs in the offer — filters out installers who can't do them (e.g. timanttiporaus) */
  selectedAddonIds: string[];
  onBack: () => void;
  onNext: () => void;
}

export function BookingStep({ state, dispatch, allServices, selectedServiceIds, selectedAddonIds, onBack, onNext }: Props) {
  const { data: allEmployees = [] } = useEmployees("installer");
  const { data: allAreas = [] } = useServiceAreas();

  const totalDuration = useMemo(() => {
    let dur = 0;
    for (const id of selectedServiceIds) {
      const svc = allServices.find((s) => s.id === id);
      if (svc) dur += svc.duration_minutes * (state.serviceQty[id] || 1);
    }
    return dur || 60;
  }, [selectedServiceIds, allServices, state.serviceQty]);

  const canProceed = !!(state.selectedDate && state.selectedTime && state.selectedEmployeeId && state.selectedCalendarId);

  return (
    <CalendarStep
      path="postal"
      postalCode={state.customer.postcode}
      selectedServiceIds={selectedServiceIds}
      selectedAddonIds={selectedAddonIds}
      allServices={allServices.map((s) => ({ id: s.id, name: s.name }))}
      allEmployees={allEmployees}
      allAreas={allAreas}
      selectedEmployeeId={state.selectedEmployeeId}
      setSelectedEmployeeId={(id) => dispatch({ type: "SET_FIELD", field: "selectedEmployeeId", value: id })}
      selectedCalendarId={state.selectedCalendarId}
      setSelectedCalendarId={(id) => dispatch({ type: "SET_FIELD", field: "selectedCalendarId", value: id })}
      selectedDate={state.selectedDate}
      setSelectedDate={(d) => dispatch({ type: "SET_FIELD", field: "selectedDate", value: d })}
      selectedTime={state.selectedTime}
      setSelectedTime={(t) => dispatch({ type: "SET_FIELD", field: "selectedTime", value: t })}
      calMonth={state.calMonth}
      setCalMonth={(m) => dispatch({ type: "SET_FIELD", field: "calMonth", value: m })}
      totalDuration={totalDuration}
      minSchedulingNoticeHours={0}
      onBack={onBack}
      onNext={onNext}
      canProceed={canProceed}
      backLabel="Takaisin"
      nextLabel="Vahvista ja luo varaus"
      isSubmitting={state.isSubmitting}
    />
  );
}
