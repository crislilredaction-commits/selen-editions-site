import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { DAILY_SIGNATURE_REMINDER_TYPE, resolveDailySignatureFollowupReminder } from "@/lib/server/dailySignatureFollowupReminders";

function text(value: unknown) { return typeof value === "string" ? value.trim() : ""; }
function authorized(req: Request) {
  const expected = process.env.DAILY_AUTOMATION_SECRET?.trim();
  if (!expected) return { ok: false as const, status: 503, error: "DAILY_AUTOMATION_SECRET manquant." };
  const received = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!received || received !== expected) return { ok: false as const, status: 401, error: "Accès refusé." };
  return { ok: true as const };
}

/**
 * La relance de signature est volontairement humaine.
 * Ce job ne contacte jamais l'apprenant : il clôt uniquement les rappels dont la signature
 * est devenue terminale. Les étapes J+3/J+6/J+9 restent visibles dans Dashboard et Pilotage Daily.
 */
export async function GET(req: Request) {
  const access = authorized(req);
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status });
  const admin = getAdminSupabase();
  const { data, error } = await admin.from("client_reminders")
    .select("id,prestation_id,metadata")
    .eq("reminder_type", DAILY_SIGNATURE_REMINDER_TYPE)
    .in("status", ["ready","postponed"])
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let resolved = 0;
  let active = 0;
  for (const reminder of data ?? []) {
    const signatureId = text(reminder.prestation_id || reminder.metadata?.signature_id);
    if (!signatureId) continue;
    const { data: signature } = await admin.from("daily_convention_signatures")
      .select("id,status,signed_at").eq("id", signatureId).maybeSingle();
    if (!signature) continue;
    if (signature.status === "signed" || signature.signed_at || ["expired","cancelled","revoked","refused"].includes(String(signature.status))) {
      await resolveDailySignatureFollowupReminder(admin, signatureId, signature.signed_at ?? new Date().toISOString());
      resolved += 1;
    } else {
      active += 1;
    }
  }
  return NextResponse.json({ ok: true, active, resolved, automaticEmailsSent: 0 });
}
export async function POST(req: Request) { return GET(req); }
