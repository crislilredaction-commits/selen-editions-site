import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireDailyClient } from "@/lib/server/dailyClientWorkspace";

export async function POST(req: Request) {
  const auth = await requireDailyClient();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const rawToken = typeof body.token === "string" ? body.token.trim() : "";
  if (!/^[a-f0-9]{64}$/i.test(rawToken)) {
    return NextResponse.json({ error: "Lien d’invitation invalide." }, { status: 400 });
  }
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const { data, error } = await auth.supabase.rpc("daily_accept_organisation_invitation", {
    p_token_hash: tokenHash,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ accepted: true, membership: data });
}
