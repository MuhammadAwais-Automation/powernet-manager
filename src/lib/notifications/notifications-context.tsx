"use client";

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabase } from "@/lib/supabase";
import {
  clearBillsCache,
  getBillByIdWithRelations,
  getRecentPaymentEvents,
  getRecentVisitedBills,
} from "@/lib/db/bills";
import { clearDashboardCache } from "@/lib/db/dashboard";
import {
  clearComplaintsCache,
  getComplaintById,
  getRecentComplaintStatusEvents,
} from "@/lib/db/complaints";
import {
  buildBillingNotification,
  didBillRefreshChange,
  didNotifyChange,
  type BillingNotification,
  type BillingRealtimeBillRow,
} from "./billing";
import {
  buildComplaintNotification,
  didComplaintStatusChange,
  type ComplaintNotification,
  type ComplaintRealtimeRow,
} from "./complaints";
import {
  buildCustomerSignupNotification,
  type CustomerSignupNotification,
  type CustomerSignupRealtimeRow,
} from "./customer-signups";
import {
  getReconnectDelayMs,
  isUnhealthyRealtimeStatus,
  MAX_REALTIME_RETRIES,
  POLLING_ACTIVATION_MS,
  POLLING_INTERVAL_MS,
  shouldUsePollingFallback,
} from "./realtime-resilience";

const MAX_TOASTS = 3;
const POLL_LIMIT = 25;

export type PaymentVerificationNotification = {
  id: string;
  dedupeKey: string;
  kind: "payment_verification";
  type: "payment_verification_pending";
  verificationId: string;
  customerName: string;
  amount: number;
  method: string;
  createdAt: string;
  read: boolean;
  title: string;
  message: string;
};

// Unified notification type — discriminated union on `kind`
export type AppNotification =
  | BillingNotification
  | ComplaintNotification
  | CustomerSignupNotification
  | PaymentVerificationNotification;

type NotificationsContextValue = {
  items: AppNotification[];
  toasts: AppNotification[];
  unreadCount: number;
  billingVersion: number;
  complaintsVersion: number;
  customerRequestsVersion: number;
  paymentVerificationsVersion: number;
  isInboxOpen: boolean;
  openInbox: () => void;
  closeInbox: () => void;
  markAllRead: () => void;
  markRead: (id: string) => void;
  markKindRead: (kind: "billing" | "complaint" | "customer_signup" | "payment_verification") => void;
  clearAll: () => void;
  dismissToast: (id: string) => void;
};

const NotificationsContext = createContext<NotificationsContextValue | null>(
  null,
);

export function NotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [toasts, setToasts] = useState<AppNotification[]>([]);
  const [billingVersion, setBillingVersion] = useState(0);
  const [complaintsVersion, setComplaintsVersion] = useState(0);
  const [customerRequestsVersion, setCustomerRequestsVersion] = useState(0);
  const [paymentVerificationsVersion, setPaymentVerificationsVersion] = useState(0);
  const [isInboxOpen, setInboxOpen] = useState(false);
  const seenKeysRef = useRef<Set<string>>(new Set());
  const seenPaymentIdsRef = useRef<Set<string>>(new Set());
  const seenVisitKeysRef = useRef<Set<string>>(new Set());
  const seenComplaintStatusKeysRef = useRef<Set<string>>(new Set());
  const pollingFallbackActiveRef = useRef(false);
  const pollingInFlightRef = useRef(false);
  const billingRealtimeConnectedRef = useRef(false);
  const complaintsRealtimeConnectedRef = useRef(false);
  const customerRequestsRealtimeConnectedRef = useRef(false);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const addNotification = useCallback((notification: AppNotification) => {
    if (seenKeysRef.current.has(notification.dedupeKey)) return;
    seenKeysRef.current.add(notification.dedupeKey);
    setItems((current) => [notification, ...current].slice(0, 50));
    setToasts((current) => [notification, ...current].slice(0, MAX_TOASTS));
  }, []);

  const refreshBillingViews = useCallback(() => {
    clearBillsCache();
    clearDashboardCache();
    setBillingVersion((version) => version + 1);
  }, []);

  const refreshComplaintViews = useCallback(() => {
    clearComplaintsCache();
    clearDashboardCache();
    setComplaintsVersion((version) => version + 1);
  }, []);

  const refreshCustomerRequestViews = useCallback(() => {
    clearDashboardCache();
    setCustomerRequestsVersion((version) => version + 1);
  }, []);

  const refreshPaymentVerificationViews = useCallback(() => {
    clearDashboardCache();
    setPaymentVerificationsVersion((version) => version + 1);
  }, []);

  const setPollingFallback = useCallback((active: boolean, reason: string) => {
    if (pollingFallbackActiveRef.current === active) return;
    pollingFallbackActiveRef.current = active;
    if (active) {
      console.warn(`Realtime unavailable, using polling fallback: ${reason}`);
    } else {
      console.info(`Realtime restored, polling fallback paused: ${reason}`);
    }
  }, []);

  const updateRealtimeHealth = useCallback(
    (
      kind: "billing" | "complaints" | "customer_requests",
      connected: boolean,
      reason: string,
    ) => {
      if (kind === "billing") billingRealtimeConnectedRef.current = connected;
      else if (kind === "complaints")
        complaintsRealtimeConnectedRef.current = connected;
      else customerRequestsRealtimeConnectedRef.current = connected;

      const shouldPoll = shouldUsePollingFallback({
        billingConnected: billingRealtimeConnectedRef.current,
        complaintsConnected: complaintsRealtimeConnectedRef.current,
      });

      if (connected && !shouldPoll) {
        setPollingFallback(false, reason);
      } else if (!connected) {
        setPollingFallback(true, reason);
      }
    },
    [setPollingFallback],
  );

  const pollFallbackChanges = useCallback(
    async (notify: boolean) => {
      if (pollingInFlightRef.current) return;
      pollingInFlightRef.current = true;

      try {
        const [payments, visits, complaints] = await Promise.all([
          getRecentPaymentEvents(POLL_LIMIT),
          getRecentVisitedBills(POLL_LIMIT),
          getRecentComplaintStatusEvents(POLL_LIMIT),
        ]);

        let billingChanged = false;
        let complaintsChanged = false;

        for (const payment of [...payments].reverse()) {
          if (seenPaymentIdsRef.current.has(payment.id)) continue;
          seenPaymentIdsRef.current.add(payment.id);
          if (!notify) continue;

          const bill = payment.bill;
          const paidAmount = bill?.paid_amount ?? payment.amount;
          const totalAmount = bill?.amount ?? paidAmount;
          const notification = buildBillingNotification({
            billId: payment.bill_id,
            customerName: payment.customer?.full_name ?? "Unknown customer",
            customerCode: payment.customer?.customer_code,
            collectorName: payment.collector?.full_name,
            amount: payment.amount,
            paidAmount,
            remainingAmount: Math.max(totalAmount - paidAmount, 0),
            status: bill?.status ?? "pending",
            receiptNo: payment.receipt_no,
            paidAt: payment.paid_at ?? payment.created_at,
            paymentMethod: payment.method,
            paymentNote: payment.note,
          });

          addNotification(notification);
          billingChanged = true;
        }

        for (const visit of [...visits].reverse()) {
          const visitKey = [
            visit.id,
            visit.payment_note ?? "no-note",
            visit.paid_at ?? "no-time",
            visit.collected_by ?? "no-collector",
          ].join(":");
          if (seenVisitKeysRef.current.has(visitKey)) continue;
          seenVisitKeysRef.current.add(visitKey);
          if (!notify) continue;

          const paidAmount = visit.paid_amount ?? 0;
          const notification = buildBillingNotification({
            billId: visit.id,
            customerName: visit.customer?.full_name ?? "Unknown customer",
            customerCode: visit.customer?.customer_code,
            collectorName: visit.collector?.full_name,
            amount: 0,
            paidAmount,
            remainingAmount: Math.max(visit.amount - paidAmount, 0),
            status: visit.status,
            receiptNo: visit.receipt_no,
            paidAt: visit.paid_at ?? new Date().toISOString(),
            paymentMethod: visit.payment_method,
            paymentNote: visit.payment_note,
            promisedDate: visit.promised_date,
          });

          addNotification(notification);
          billingChanged = true;
        }

        for (const complaint of [...complaints].reverse()) {
          const statusKey = `${complaint.id}:${complaint.status}`;
          if (seenComplaintStatusKeysRef.current.has(statusKey)) continue;
          seenComplaintStatusKeysRef.current.add(statusKey);
          if (!notify) continue;

          const notification = buildComplaintNotification({
            complaintId: complaint.id,
            complaintCode: complaint.complaint_code,
            customerName: complaint.customer?.full_name ?? "Unknown customer",
            technicianName: complaint.technician?.full_name ?? null,
            priority: complaint.priority,
            status: complaint.status,
            updatedAt:
              complaint.status === "open"
                ? complaint.opened_at
                : (complaint.resolved_at ?? new Date().toISOString()),
          });

          addNotification(notification);
          complaintsChanged = true;
        }

        if (billingChanged) refreshBillingViews();
        if (complaintsChanged) refreshComplaintViews();
      } catch (error) {
        console.warn("Polling fallback could not refresh notifications", error);
      } finally {
        pollingInFlightRef.current = false;
      }
    },
    [addNotification, refreshBillingViews, refreshComplaintViews],
  );

  useEffect(() => {
    void pollFallbackChanges(false);
    const timer = window.setInterval(() => {
      if (pollingFallbackActiveRef.current) void pollFallbackChanges(true);
    }, POLLING_INTERVAL_MS);

    const activationTimer = window.setTimeout(() => {
      const shouldPoll = shouldUsePollingFallback({
        billingConnected: billingRealtimeConnectedRef.current,
        complaintsConnected: complaintsRealtimeConnectedRef.current,
      });
      if (shouldPoll)
        setPollingFallback(
          true,
          "initial realtime connection did not complete",
        );
    }, POLLING_ACTIVATION_MS);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(activationTimer);
    };
  }, [pollFallbackChanges, setPollingFallback]);

  // ── Billing realtime subscription (bills table) ───────────────────────────────
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimer: number | null = null;
    let retryAttempt = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      channel = supabase
        .channel("dashboard-billing-payments")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "bills" },
          async (payload) => {
            const oldRow = payload.old as BillingRealtimeBillRow | null;
            const newRow = payload.new as BillingRealtimeBillRow | null;
            if (!didBillRefreshChange(oldRow, newRow) || !newRow?.id) return;

            refreshBillingViews();

            if (!didNotifyChange(oldRow, newRow)) return;

            try {
              const bill = await getBillByIdWithRelations(newRow.id);
              if (!bill) return;

              const oldPaid =
                typeof oldRow?.paid_amount === "number"
                  ? oldRow.paid_amount
                  : 0;
              const paidAmount = bill.paid_amount ?? 0;
              const amountPaid =
                Math.max(paidAmount - oldPaid, 0) || paidAmount;
              const notification = buildBillingNotification({
                billId: bill.id,
                customerName: bill.customer?.full_name ?? "Unknown customer",
                customerCode: bill.customer?.customer_code,
                collectorName: bill.collector?.full_name,
                amount: amountPaid,
                paidAmount,
                remainingAmount: Math.max(bill.amount - paidAmount, 0),
                status: bill.status,
                receiptNo: bill.receipt_no,
                paidAt: bill.paid_at ?? new Date().toISOString(),
                paymentMethod: bill.payment_method,
                paymentNote: bill.payment_note,
                paymentSource: bill.payment_source,
                promisedDate: bill.promised_date,
              });

              addNotification(notification);
            } catch (error) {
              console.error("Could not build billing notification", error);
            }
          },
        )
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") {
            retryAttempt = 0;
            updateRealtimeHealth("billing", true, "billing channel subscribed");
            return;
          }

          if (!isUnhealthyRealtimeStatus(status)) return;

          updateRealtimeHealth("billing", false, `billing channel ${status}`);
          console.warn(
            "Dashboard billing realtime channel is not healthy:",
            status,
            error,
          );

          if (retryAttempt >= MAX_REALTIME_RETRIES) return;
          const delay = getReconnectDelayMs(retryAttempt);
          retryAttempt += 1;
          retryTimer = window.setTimeout(() => {
            const current = channel;
            channel = null;
            if (current) void supabase.removeChannel(current);
            connect();
          }, delay);
        });
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [addNotification, refreshBillingViews, updateRealtimeHealth]);

  // ── Complaints realtime subscription (complaints table) ───────────────────────
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimer: number | null = null;
    let retryAttempt = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      channel = supabase
        .channel("dashboard-complaint-updates")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "complaints" },
          async (payload) => {
            const oldRow = payload.old as ComplaintRealtimeRow | null;
            const newRow = payload.new as ComplaintRealtimeRow | null;

            // Always clear cache so the complaints page refreshes
            refreshComplaintViews();

            // Show intake notifications for new open complaints and technician status updates.
            if (!didComplaintStatusChange(oldRow, newRow) || !newRow?.id)
              return;

            try {
              const complaint = await getComplaintById(newRow.id);
              if (!complaint) return;

              const notification = buildComplaintNotification({
                complaintId: complaint.id,
                complaintCode: complaint.complaint_code,
                customerName:
                  complaint.customer?.full_name ?? "Unknown customer",
                technicianName: complaint.technician?.full_name ?? null,
                priority: complaint.priority,
                status: complaint.status,
                updatedAt:
                  complaint.status === "open"
                    ? complaint.opened_at
                    : (complaint.resolved_at ?? new Date().toISOString()),
              });

              addNotification(notification);
            } catch (error) {
              console.error("Could not build complaint notification", error);
            }
          },
        )
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") {
            retryAttempt = 0;
            updateRealtimeHealth(
              "complaints",
              true,
              "complaints channel subscribed",
            );
            return;
          }

          if (!isUnhealthyRealtimeStatus(status)) return;

          updateRealtimeHealth(
            "complaints",
            false,
            `complaints channel ${status}`,
          );
          console.warn(
            "Dashboard complaints realtime channel is not healthy:",
            status,
            error,
          );

          if (retryAttempt >= MAX_REALTIME_RETRIES) return;
          const delay = getReconnectDelayMs(retryAttempt);
          retryAttempt += 1;
          retryTimer = window.setTimeout(() => {
            const current = channel;
            channel = null;
            if (current) void supabase.removeChannel(current);
            connect();
          }, delay);
        });
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [addNotification, refreshComplaintViews, updateRealtimeHealth]);

  // Customer signup realtime subscription
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimer: number | null = null;
    let retryAttempt = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      channel = supabase
        .channel("dashboard-customer-signups")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "customer_signup_requests",
          },
          async (payload) => {
            const row = payload.new as CustomerSignupRealtimeRow | null;
            if (!row?.id || row.status !== "pending") return;
            refreshCustomerRequestViews();

            const { data } = await supabase
              .from("customer_signup_requests")
              .select(
                "id, full_name, house_id, created_at, area:areas(name), package:packages(name)",
              )
              .eq("id", row.id)
              .maybeSingle();

            const request = data as {
              id: string;
              full_name: string;
              house_id: string;
              created_at: string;
              area?: { name?: string | null } | null;
              package?: { name?: string | null } | null;
            } | null;

            addNotification(
              buildCustomerSignupNotification({
                requestId: row.id,
                customerName:
                  request?.full_name ?? row.full_name ?? "New customer",
                houseId: request?.house_id ?? row.house_id ?? "unknown",
                areaName: request?.area?.name,
                packageName: request?.package?.name,
                createdAt: request?.created_at ?? row.created_at,
              }),
            );
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "customer_signup_requests",
          },
          () => {
            refreshCustomerRequestViews();
          },
        )
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") {
            retryAttempt = 0;
            updateRealtimeHealth(
              "customer_requests",
              true,
              "customer requests channel subscribed",
            );
            return;
          }

          if (!isUnhealthyRealtimeStatus(status)) return;
          updateRealtimeHealth(
            "customer_requests",
            false,
            `customer requests channel ${status}`,
          );
          console.warn(
            "Dashboard customer requests realtime channel is not healthy:",
            status,
            error,
          );

          if (retryAttempt >= MAX_REALTIME_RETRIES) return;
          const delay = getReconnectDelayMs(retryAttempt);
          retryAttempt += 1;
          retryTimer = window.setTimeout(() => {
            const current = channel;
            channel = null;
            if (current) void supabase.removeChannel(current);
            connect();
          }, delay);
        });
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [addNotification, refreshCustomerRequestViews, updateRealtimeHealth]);

  // Payment verifications realtime subscription
  useEffect(() => {
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let retryTimer: number | null = null;
    let retryAttempt = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      channel = supabase
        .channel("dashboard-payment-verifications")
        .on(
          "postgres_changes",
          {
            event: "INSERT",
            schema: "public",
            table: "payment_verifications",
          },
          async (payload) => {
            const row = payload.new as {
              id: string;
              customer_id: string;
              amount: number;
              method: string;
              created_at: string;
              status: string;
            } | null;
            if (!row?.id) return;
            refreshPaymentVerificationViews();

            const { data } = await supabase
              .from("payment_verifications")
              .select("id, amount, method, created_at, customer:customers(full_name)")
              .eq("id", row.id)
              .maybeSingle();

            const verification = data as {
              id: string;
              amount: number;
              method: string;
              created_at: string;
              customer?: { full_name?: string | null } | null;
            } | null;

            const dedupeKey = `payment-verification:${row.id}`;
            const customerName = verification?.customer?.full_name ?? "Unknown customer";
            addNotification({
              id: `${dedupeKey}:${verification?.created_at ?? row.created_at ?? Date.now()}`,
              dedupeKey,
              kind: "payment_verification",
              type: "payment_verification_pending",
              verificationId: row.id,
              customerName,
              amount: verification?.amount ?? row.amount ?? 0,
              method: verification?.method ?? row.method ?? "online",
              createdAt: verification?.created_at ?? row.created_at ?? new Date().toISOString(),
              read: false,
              title: "Payment Approval Pending",
              message: `${customerName} submitted a payment of Rs. ${(verification?.amount ?? row.amount ?? 0).toLocaleString()} via ${verification?.method ?? row.method ?? "online"} for verification.`,
            });
          },
        )
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "payment_verifications",
          },
          () => {
            refreshPaymentVerificationViews();
          },
        )
        .on(
          "postgres_changes",
          {
            event: "DELETE",
            schema: "public",
            table: "payment_verifications",
          },
          () => {
            refreshPaymentVerificationViews();
          },
        )
        .subscribe((status, error) => {
          if (status === "SUBSCRIBED") {
            retryAttempt = 0;
            return;
          }

          if (!isUnhealthyRealtimeStatus(status)) return;
          console.warn(
            "Dashboard payment verifications realtime channel is not healthy:",
            status,
            error,
          );

          if (retryAttempt >= MAX_REALTIME_RETRIES) return;
          const delay = getReconnectDelayMs(retryAttempt);
          retryAttempt += 1;
          retryTimer = window.setTimeout(() => {
            const current = channel;
            channel = null;
            if (current) void supabase.removeChannel(current);
            connect();
          }, delay);
        });
    };

    connect();

    return () => {
      disposed = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [addNotification, refreshPaymentVerificationViews]);

  const value = useMemo<NotificationsContextValue>(
    () => ({
      items,
      toasts,
      unreadCount: items.filter((item) => !item.read).length,
      billingVersion,
      complaintsVersion,
      customerRequestsVersion,
      paymentVerificationsVersion,
      isInboxOpen,
      openInbox: () => setInboxOpen(true),
      closeInbox: () => setInboxOpen(false),
      markAllRead: () =>
        setItems((current) => current.map((item) => ({ ...item, read: true }))),
      markRead: (id: string) =>
        setItems((current) =>
          current.map((item) =>
            item.id === id ? { ...item, read: true } : item,
          ),
        ),
      markKindRead: (kind) =>
        setItems((current) =>
          current.map((item) =>
            item.kind === kind ? { ...item, read: true } : item,
          ),
        ),
      clearAll: () => {
        seenKeysRef.current.clear();
        setItems([]);
      },
      dismissToast,
    }),
    [
      billingVersion,
      complaintsVersion,
      customerRequestsVersion,
      paymentVerificationsVersion,
      dismissToast,
      isInboxOpen,
      items,
      toasts,
    ],
  );

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  );
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext);
  if (!context)
    throw new Error(
      "useNotifications must be used inside NotificationsProvider",
    );
  return context;
}
