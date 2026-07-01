import { NextResponse } from "next/server";
import { sendFcmToTokens } from "@/lib/fcm";
import { supabaseAdmin } from "@/lib/supabase-admin";

type PushBody = {
  staffId?: string;
  title?: string;
  body?: string;
  data?: Record<string, string>;
};

export async function POST(request: Request) {
  if (!process.env.FCM_SERVICE_ACCOUNT_JSON?.trim()) {
    return NextResponse.json(
      { ok: false, error: "FCM_SERVICE_ACCOUNT_JSON not configured" },
      { status: 503 },
    );
  }

  let payload: PushBody;
  try {
    payload = (await request.json()) as PushBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const staffId = payload.staffId?.trim();
  const title = payload.title?.trim() ?? "PowerNet Alert";
  const body = payload.body?.trim() ?? "";
  if (!staffId) {
    return NextResponse.json({ ok: false, error: "staffId required" }, { status: 400 });
  }

  const { data: tokens, error } = await supabaseAdmin
    .from("staff_device_tokens")
    .select("fcm_token")
    .eq("staff_id", staffId);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  const fcmTokens = (tokens ?? [])
    .map((row) => row.fcm_token as string)
    .filter(Boolean);
  if (fcmTokens.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, message: "No device tokens" });
  }

  try {
    const result = await sendFcmToTokens(
      fcmTokens,
      title,
      body,
      payload.data,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "FCM send failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}