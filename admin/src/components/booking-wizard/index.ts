export { StepIndicator } from "./StepIndicator";
export { ServiceSelectionStep } from "./steps/ServiceSelectionStep";
export { CustomerFormStep, type CustomerType } from "./steps/CustomerFormStep";
export { SummaryStep } from "./steps/SummaryStep";
export {
  type ExtraItemForm,
  type CustomerFormData,
  type LeadSourceOption,
  type LineItemInput,
  type PricingResult,
  LEAD_SOURCES,
  LEAD_SOURCES_WITH_SALES,
  labelCls,
  parseExtras,
  buildLineItems,
  calculatePricing,
  validateDiscountCode,
} from "./types";
