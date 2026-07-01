"use client";

import React, { useState } from "react";
import { Modal } from "../ui";
import {
  recordFollowUpCall,
  type CallOutcome,
  type CommitmentAction,
  type CallerChannel,
} from "@/lib/db/follow-ups";
import type { BillWithRelations } from "@/types/database";

const OUTCOMES: { value: CallOutcome; label: string }[] = [
  { value: "answered", label: "Answered" },
  { value: "no_answer", label: "No Answer" },
  { value: "busy", label: "Busy" },
  { value: "wrong_number", label: "Wrong Number" },
  { value: "switched_off", label: "Switched Off" },
];

const ACTIONS: { value: CommitmentAction; label: string }[] = [
  { value: "new_promise_date", label: "New promised date" },
  { value: "will_pay_office", label: "Will pay at office" },
  { value: "will_pay_field", label: "Will pay to recovery agent" },
  { value: "refused", label: "Refused to pay" },
  { value: "already_paid", label: "Already paid" },
  { value: "callback_later", label: "Call back later" },
  { value: "none", label: "No commitment change" },
];

export function FollowUpCallModal({
  bill,
  staffId,
  callerChannel,
  open,
  onClose,
  onSaved,
}: {
  bill: BillWithRelations;
  staffId: string;
  callerChannel: CallerChannel;
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [outcome, setOutcome] = useState<CallOutcome>("answered");
  const [action, setAction] = useState<CommitmentAction>("none");
  const [promisedDate, setPromisedDate] = useState("");
  const [nextFollowUp, setNextFollowUp] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phone = bill.customer?.phone?.trim();

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await recordFollowUpCall({
        customerId: bill.customer_id,
        billId: bill.id,
        callerId: staffId,
        callerChannel,
        callOutcome: outcome,
        commitmentAction: action,
        promisedDate: action === "new_promise_date" && promisedDate ? promisedDate : null,
        nextFollowUpDate: nextFollowUp || null,
        notes: notes.trim() || null,
      });
      onSaved("Call record saved");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save call record");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} width={520}>
      <div className="modal-head">
        <h3>Log Follow-up Call</h3>
      </div>
      <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="card" style={{ padding: 12 }}>
          <div style={{ fontWeight: 700 }}>{bill.customer?.full_name ?? "Customer"}</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {bill.customer?.customer_code ?? ""}
            {phone ? ` · ${phone}` : ""}
          </div>
          {phone && (
            <a
              href={`tel:${phone}`}
              className="btn btn-secondary btn-sm"
              style={{ marginTop: 10, display: "inline-flex" }}
            >
              Call {phone}
            </a>
          )}
        </div>

        <div className="field">
          <label>Call outcome</label>
          <select className="select" value={outcome} onChange={(e) => setOutcome(e.target.value as CallOutcome)}>
            {OUTCOMES.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Customer response</label>
          <select className="select" value={action} onChange={(e) => setAction(e.target.value as CommitmentAction)}>
            {ACTIONS.map((a) => (
              <option key={a.value} value={a.value}>{a.label}</option>
            ))}
          </select>
        </div>

        {action === "new_promise_date" && (
          <div className="field">
            <label>New promised date</label>
            <input className="input" type="date" value={promisedDate} onChange={(e) => setPromisedDate(e.target.value)} />
          </div>
        )}

        <div className="field">
          <label>Next follow-up date (optional)</label>
          <input className="input" type="date" value={nextFollowUp} onChange={(e) => setNextFollowUp(e.target.value)} />
        </div>

        <div className="field">
          <label>Notes</label>
          <textarea
            className="input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="What did the customer say?"
          />
        </div>

        {error && <div style={{ color: "var(--red)", fontSize: 13 }}>{error}</div>}
      </div>

      <div className="modal-foot">
        <button className="btn btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Call Record"}
        </button>
      </div>
    </Modal>
  );
}