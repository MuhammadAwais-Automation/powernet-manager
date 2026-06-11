import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const staffId = request.nextUrl.searchParams.get("staffId")?.trim();
  if (!staffId || !uuidPattern.test(staffId)) {
    return NextResponse.json({ error: "Invalid staffId" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("team_members")
    .select("team_id")
    .eq("staff_id", staffId);

  if (error) {
    return NextResponse.json(
      { error: "Unable to load team memberships" },
      { status: 500 },
    );
  }

  return NextResponse.json(
    {
      teamIds: (data ?? [])
        .map((row) => row.team_id)
        .filter((teamId): teamId is string => typeof teamId === "string"),
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
