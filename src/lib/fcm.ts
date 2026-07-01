import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging } from "firebase-admin/messaging";

let fcmApp: App | null = null;

function getFcmApp(): App {
  if (fcmApp) return fcmApp;

  const raw = process.env.FCM_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON not configured");
  }

  let serviceAccount: Record<string, string>;
  try {
    serviceAccount = JSON.parse(raw) as Record<string, string>;
  } catch {
    throw new Error("FCM_SERVICE_ACCOUNT_JSON is invalid JSON");
  }

  fcmApp =
    getApps().length > 0
      ? getApps()[0]!
      : initializeApp({
          credential: cert(serviceAccount),
          projectId: serviceAccount.project_id,
        });

  return fcmApp;
}

export async function sendFcmToTokens(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ sent: number; total: number; failures: number }> {
  const messaging = getMessaging(getFcmApp());
  const results = await Promise.all(
    tokens.map(async (token) => {
      try {
        await messaging.send({
          token,
          notification: { title, body },
          data: data ?? {},
          android: {
            priority: "high",
            notification: { channelId: "powernet_alerts" },
          },
        });
        return true;
      } catch {
        return false;
      }
    }),
  );

  const sent = results.filter(Boolean).length;
  return { sent, total: tokens.length, failures: tokens.length - sent };
}