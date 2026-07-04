export const COMPLAINT_TYPES = [
  { value: "fiber_issue", label: "Fiber Issue", serviceLine: "internet" as const },
  { value: "no_internet", label: "Connected, No Internet", serviceLine: "internet" as const },
  { value: "device_issue", label: "Device Issue", serviceLine: "internet" as const },
  { value: "payment_issue", label: "Payment Issue", serviceLine: "internet" as const },
  { value: "other", label: "Other Concern", serviceLine: "internet" as const },
] as const;

export const CABLE_COMPLAINT_TYPES = [
  { value: "cable_issue", label: "Cable Issue", serviceLine: "cable" as const },
  { value: "cable_down", label: "Cable Down", serviceLine: "cable" as const },
] as const;

export const ALL_COMPLAINT_TYPES = [...COMPLAINT_TYPES, ...CABLE_COMPLAINT_TYPES] as const;

export type ComplaintTypeValue = (typeof ALL_COMPLAINT_TYPES)[number]["value"];

export type ComplaintServiceLine = "internet" | "cable";

const CABLE_TYPE_SET = new Set<string>([
  ...CABLE_COMPLAINT_TYPES.map((t) => t.value),
  "signal_issue",
  "onu_fault",
  "no_signal",
]);

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
  cable_issue: "Cable Issue",
  cable_down: "Cable Down",
  signal_issue: "Cable Issue",
  onu_fault: "Cable Issue",
  no_signal: "Cable Down",
};

export function formatComplaintType(type?: string | null): string {
  if (!type) return "—";
  return LEGACY_LABELS[type] ?? type.replace(/_/g, " ");
}

export function isPresetComplaintType(type: string): boolean {
  return ALL_COMPLAINT_TYPES.some((item) => item.value === type);
}

export function getComplaintServiceLine(type: string): ComplaintServiceLine {
  return CABLE_TYPE_SET.has(type) ? "cable" : "internet";
}

export function formatServiceLine(line?: string | null): string {
  if (line === "cable") return "Cable";
  return "Internet";
}

/** Roles that can be manually assigned to any complaint (cable or internet). */
export const ASSIGNABLE_TECHNICIAN_ROLES = ["technician", "cable_technician"] as const;

export function assignableTechnicianRoles(): string[] {
  return [...ASSIGNABLE_TECHNICIAN_ROLES];
}