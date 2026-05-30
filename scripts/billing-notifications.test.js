const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const root = process.cwd();
const outDir = path.join(root, ".tmp-billing-notifications-test");
const source = path.join(root, "src", "lib", "notifications", "billing.ts");

if (fs.existsSync(outDir)) fs.rmSync(outDir, { recursive: true, force: true });

const tscArgs = [
  "tsc",
  source,
  "--module",
  "commonjs",
  "--target",
  "ES2020",
  "--outDir",
  outDir,
  "--skipLibCheck",
];

if (process.platform === "win32") {
  execFileSync("cmd.exe", ["/c", "npx", ...tscArgs], { stdio: "inherit" });
} else {
  execFileSync("npx", tscArgs, { stdio: "inherit" });
}

const billing = require(path.join(outDir, "billing.js"));

assert.strictEqual(
  billing.didPaymentChange(
    { id: "bill-1", paid_amount: 0, status: "pending" },
    { id: "bill-1", paid_amount: 500, status: "pending" },
  ),
  true,
);
assert.strictEqual(
  billing.didPaymentChange(
    { id: "bill-1", paid_amount: 500, status: "pending" },
    { id: "bill-1", paid_amount: 500, status: "pending" },
  ),
  false,
);
assert.strictEqual(
  billing.didPaymentChange(
    { id: "bill-1", paid_amount: 500, status: "pending" },
    { id: "bill-1", paid_amount: 500, status: "paid" },
  ),
  true,
);
assert.strictEqual(
  billing.didPaymentChange(
    { id: "bill-1", paid_amount: 500, status: "pending", receipt_no: null },
    { id: "bill-1", paid_amount: 500, status: "pending", receipt_no: "R-100" },
  ),
  true,
);
assert.strictEqual(
  billing.didPaymentChange(
    { id: "bill-1", paid_amount: 0, status: "pending", payment_method: null },
    {
      id: "bill-1",
      paid_amount: 0,
      status: "pending",
      payment_method: "visit",
      paid_at: "2026-05-21T10:00:00Z",
    },
  ),
  false,
);
assert.strictEqual(
  billing.didBillRefreshChange(
    { id: "bill-1", paid_amount: 0, status: "pending", payment_method: null },
    {
      id: "bill-1",
      paid_amount: 0,
      status: "pending",
      payment_method: "visit",
      paid_at: "2026-05-21T10:00:00Z",
    },
  ),
  true,
);

assert.strictEqual(
  billing.buildBillingNotificationDedupeKey({
    billId: "bill-1",
    paidAmount: 1600,
    status: "paid",
    receiptNo: "R-100",
  }),
  "bill-1:paid:1600:R-100",
);

const partial = billing.buildBillingNotification({
  billId: "bill-2",
  customerName: "Ahmed Javeed",
  customerCode: "C-10076",
  collectorName: "Recovery Agent 1",
  amount: 1100,
  paidAmount: 1100,
  remainingAmount: 1100,
  status: "pending",
  receiptNo: "R-200",
  paidAt: "2026-05-21T10:00:00.000Z",
  paymentSource: "office",
});

assert.strictEqual(partial.type, "payment_partial");
assert.strictEqual(partial.title, "Partial payment received");
assert.match(partial.message, /Ahmed Javeed paid Rs\. 1,100 in office/);
assert.match(partial.message, /Recovery Agent 1/);
assert.strictEqual(partial.read, false);

const full = billing.buildBillingNotification({
  billId: "bill-3",
  customerName: "Saleem",
  amount: 1600,
  paidAmount: 1600,
  remainingAmount: 0,
  status: "paid",
});

assert.strictEqual(full.type, "payment_full");
assert.strictEqual(full.title, "Full payment received");
assert.strictEqual(full.remainingAmount, 0);

console.log("billing-notifications tests passed");
