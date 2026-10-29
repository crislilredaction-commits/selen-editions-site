import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { requireDailyClient } from "@/lib/server/dailyClientWorkspace";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

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

  const accepted = Array.isArray(data) ? data[0] : data;
  const membershipId = accepted && typeof accepted === "object" ? String((accepted as Record<string, unknown>).membership_id ?? "") : "";
  const email = auth.user.email?.trim().toLowerCase() ?? "";
  if (membershipId && email) {
    const admin = getAdminSupabase();
    const { data: membership } = await admin
      .from("organisation_memberships")
      .select("organisation_id")
      .eq("id", membershipId)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (membership?.organisation_id) {
      const { error: trainerLinkError } = await admin
        .from("daily_trainer_profiles")
        .update({ membership_id: membershipId, user_id: auth.user.id })
        .eq("organisation_id", membership.organisation_id)
        .ilike("professional_email", email)
        .is("user_id", null);
      if (trainerLinkError) {
        console.error("Invitation Daily : accès accepté mais fiche formateur non rattachée", trainerLinkError);
      }
    }
  }

  return NextResponse.json({ accepted: true, membership: data });
}
