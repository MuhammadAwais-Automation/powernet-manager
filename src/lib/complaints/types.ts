export const COMPLAINT_TYPES = [
  { value: "fiber_issue", label: "Fiber Issue" },
  { value: "no_internet", label: "Connected, No Internet" },
  { value: "device_issue", label: "Device Issue" },
  { value: "payment_issue", label: "Payment Issue" },
  { value: "other", label: "Other Concern" },
] as const;

export type ComplaintTypeValue = (typeof COMPLAINT_TYPES)[number]["value"];

const LEGACY_LABELS: Record<string, string> = {
  connectivity: "Connected, No Internet",
  speed: "Connected, No Internet",
  hardware: "Fiber Issue",
  billing: "Payment Issue",
  upgrade: "Other Concern",
  fiber_issue: "Fiber Issue",
  no_internet: "Connected, No Internet",
  device_issue: "Device Issue",
  payment_issue: "Payment Issue",
  other: "Other Concern",
};

export function formatComplaintType(type?: string | null): string {
  if (!type) return "—";
  return LEGACY_LABELS[type] ?? type.replace(/_/g, " ");
}

export function isPresetComplaintType(type: string): boolean {
  return COMPLAINT_TYPES.some((item) => item.value === type);
}