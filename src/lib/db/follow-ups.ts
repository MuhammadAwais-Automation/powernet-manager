import { supabase } from "@/lib/supabase";
import { getErrorMessage } from "@/lib/utils";

export type CallerChannel = "office" | "recovery_agent";
export type CallOutcome =
  | "answered"
  | "no_answer"
  | "busy"
  | "wrong_number"
  | "switched_off";
export type CommitmentAction =
  | "new_promise_date"
  | "will_pay_office"
  | "will_pay_field"
  | "refused"
  | "already_paid"
  | "callback_later"
  | "none";

export type FollowUpCall = {
  id: string;
  customer_id: string;
  bill_id: string | null;
  caller_id: string;
  caller_channel: CallerChannel;
  call_outcome: CallOutcome;
  commitment_action: CommitmentAction | null;
  promised_date: string | null;
  notes: string | null;
  called_at: string;
  next_follow_up_date: string | null;
  created_at: string;
  caller?: { id: string; full_name: string } | null;
};

export type CommitmentEvent = {
  id: string;
  customer_id: string;
  bill_id: string | null;
  follow_up_call_id: string | null;
  event_type:
    | "visit_logged"
    | "office_call"
    | "agent_call"
    | "payment_received"
    | "promise_updated";
  source_staff_id: string | null;
  summary: string;
  promised_date: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  source_staff?: { id: string; full_name: string } | null;
};

export type RecordFollowUpCallInput = {
  customerId: string;
  billId?: string | null;
  callerId: string;
  callerChannel: CallerChannel;
  callOutcome: CallOutcome;
  commitmentAction?: CommitmentAction | null;
  promisedDate?: string | null;
  notes?: string | null;
  nextFollowUpDate?: string | null;
};

export async function getFollowUpCallsForBill(
  billId: string,
): Promise<FollowUpCall[]> {
  const { data, error } = await supabase
    .from("follow_up_calls")
    .select(
      "id, customer_id, bill_id, caller_id, caller_channel, call_outcome, commitment_action, promised_date, notes, called_at, next_follow_up_date, created_at, caller:staff(id, full_name)",
    )
    .eq("bill_id", billId)
    .order("called_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as FollowUpCall[];
}

export async function getFollowUpCallsForCustomer(
  customerId: string,
  limit = 20,
): Promise<FollowUpCall[]> {
  const { data, error } = await supabase
    .from("follow_up_calls")
    .select(
      "id, customer_id, bill_id, caller_id, caller_channel, call_outcome, commitment_action, promised_date, notes, called_at, next_follow_up_date, created_at, caller:staff(id, full_name)",
    )
    .eq("customer_id", customerId)
    .order("called_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as FollowUpCall[];
}

export async function getCommitmentEventsForCustomer(
  customerId: string,
  limit = 30,
): Promise<CommitmentEvent[]> {
  const { data, error } = await supabase
    .from("customer_commitment_events")
    .select(
      "id, customer_id, bill_id, follow_up_call_id, event_type, source_staff_id, summary, promised_date, metadata, created_at, source_staff:staff(id, full_name)",
    )
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as unknown as CommitmentEvent[];
}

export async function recordFollowUpCall(
  input: RecordFollowUpCallInput,
): Promise<FollowUpCall> {
  const { data, error } = await supabase
    .from("follow_up_calls")
    .insert({
      customer_id: input.customerId,
      bill_id: input.billId ?? null,
      caller_id: input.callerId,
      caller_channel: input.callerChannel,
      call_outcome: input.callOutcome,
      commitment_action: input.commitmentAction ?? null,
      promised_date: input.promisedDate ?? null,
      notes: input.notes?.trim() || null,
      next_follow_up_date: input.nextFollowUpDate ?? null,
    })
    .select(
      "id, customer_id, bill_id, caller_id, caller_channel, call_outcome, commitment_action, promised_date, notes, called_at, next_follow_up_date, created_at",
    )
    .single();
  if (error) throw new Error(getErrorMessage(error, "Could not save call record"));
  return data as FollowUpCall;
}

export async function getBillCallStats(billIds: string[]): Promise<
  Record<
    string,
    { total: number; office: number; agent: number; lastCalledAt: string | null }
  >
> {
  if (billIds.length === 0) return {};
  const { data, error } = await supabase
    .from("follow_up_calls")
    .select("bill_id, caller_channel, called_at")
    .in("bill_id", billIds);
  if (error) throw error;

  const stats: Record<
    string,
    { total: number; office: number; agent: number; lastCalledAt: string | null }
  > = {};

  for (const row of data ?? []) {
    const billId = row.bill_id as string | null;
    if (!billId) continue;
    if (!stats[billId]) {
      stats[billId] = { total: 0, office: 0, agent: 0, lastCalledAt: null };
    }
    const entry = stats[billId];
    entry.total += 1;
    if (row.caller_channel === "office") entry.office += 1;
    if (row.caller_channel === "recovery_agent") entry.agent += 1;
    const calledAt = row.called_at as string;
    if (!entry.lastCalledAt || calledAt > entry.lastCalledAt) {
      entry.lastCalledAt = calledAt;
    }
  }
  return stats;
}