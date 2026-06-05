# Billing Payments MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build working monthly bill generation, payment recording, receipt history, and billing UI actions for PowerNet Manager.

**Architecture:** Keep invoice state in `public.bills`, record each payment/receipt in a new `public.payments` table, and expose safe Supabase RPCs for bulk generation and payment recording. The React billing page calls focused data-layer functions from `src/lib/db/bills.ts`; pure date/amount helpers live in `src/lib/billing/core.ts` with script-based tests.

**Tech Stack:** Next.js 15 App Router SPA shell, React 18, Supabase Postgres/RPC, TypeScript, Node script tests.

---

### Task 1: Billing Core Test Harness

**Files:**
- Create: `scripts/billing-core.test.js`
- Create: `src/lib/billing/core.ts`
- Modify: `package.json`

- [ ] Add a Node test script that compiles `src/lib/billing/core.ts` into `.tmp-billing-test` and verifies month normalization, active-customer eligibility, and bill amount selection.
- [ ] Run `npm run test:billing-core` before implementation and confirm it fails because `src/lib/billing/core.ts` is missing.
- [ ] Implement `normalizeBillingMonth`, `isBillableCustomerStatus`, and `getCustomerBillAmount`.
- [ ] Re-run `npm run test:billing-core` and confirm it passes.

### Task 2: Supabase Billing Schema and RPCs

**Files:**
- Create: `scripts/sql/billing_payments_mvp.sql`
- Modify: live Supabase project `jzhxckqomhjgokkyxkmk`

- [ ] Add `paid_amount`, `receipt_no`, `payment_method`, and `payment_note` columns to `public.bills`.
- [ ] Add a unique constraint/index for one bill per `customer_id + month`.
- [ ] Create `public.payments` with `bill_id`, `customer_id`, `amount`, `collected_by`, `method`, `note`, `receipt_no`, and `paid_at`.
- [ ] Create `public.generate_monthly_bills(p_month text)` to insert active customer bills and skip existing or zero-amount rows.
- [ ] Create `public.record_bill_payment(...)` to insert a receipt, increment `paid_amount`, and mark the bill `paid` when fully collected.
- [ ] Apply the SQL through Supabase MCP and verify both functions with safe read-only/sample queries.

### Task 3: Billing Data Layer and Types

**Files:**
- Modify: `src/types/database.ts`
- Modify: `src/lib/db/bills.ts`

- [ ] Extend `Bill` and `BillWithRelations` with payment summary fields.
- [ ] Add `Payment`, `GenerateBillsResult`, and `RecordPaymentResult` types.
- [ ] Add `getBills(month?: string)`, `generateMonthlyBills(month)`, `recordBillPayment(input)`, and `markBillPaid(bill)`.
- [ ] Clear the bills cache after generation or payment mutation.

### Task 4: Billing Page UX

**Files:**
- Modify: `src/components/pages/BillingPage.tsx`

- [ ] Add billing month state and reload bills by month.
- [ ] Wire Generate Bills button to `generateMonthlyBills`.
- [ ] Add bill search across bill id, customer code, and customer name.
- [ ] Wire Mark Paid to record the remaining balance.
- [ ] Wire Record Cash Payment to selected unpaid bill, amount, collector, and note.
- [ ] Show paid amount, remaining amount, receipt id, and success/error messages.

### Task 5: Verification

**Commands:**
- `npm run test:billing-core`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run build`

- [ ] Confirm all commands pass.
- [ ] Run a live Supabase smoke query for bill generation in a non-destructive way where possible.
- [ ] Summarize any remaining limitations, especially partial-payment reporting and RLS hardening.
