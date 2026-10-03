import { renderRegistrationProgramPdf } from "@/lib/server/dailyRegistrationProgramPdf";
import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type Params = { params: Promise<{ token: string }> };
const clean = (v: unknown) => String(v ?? "").trim();
const safe = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 80) || "formation";
const fields = "id,user_id,title,status,creation_mode,global_objective,learning_objectives,target_audience,prerequisites,duration_hours,duration_days,modality,modality_details,access_delays,registration_methods,price,detailed_program,accessibility,pedagogical_resources,pedagogical_methods,evaluation_methods,contact_phone,contact_email,contact_website";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: Params) {
  const token = clean((await params).token);
  if (!token) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  try {
    const admin = getAdminSupabase();
    const { data: session, error: sessionError } = await admin.from("daily_sessions").select(`user_id,daily_formations(${fields})`).eq("registration_token", token).neq("status", "archived").maybeSingle();
    if (sessionError) throw sessionError;
    let formation = session ? (Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations) : null;
    let userId = session?.user_id ?? null;
    if (!session) {
      const { data, error } = await admin.from("daily_formations").select(`public_registration_enabled,public_registration_token,${fields}`).eq("public_registration_token", token).eq("public_registration_enabled", true).neq("status", "archived").maybeSingle();
      if (error) throw error;
      formation = data;
      userId = data?.user_id ?? null;
    }
    if (!formation) return NextResponse.json({ error: "Programme introuvable." }, { status: 404 });
    if (formation.status === "archived") return NextResponse.json({ error: "Programme introuvable." }, { status: 404 });
    if (formation.status !== "validated") return NextResponse.json({ error: "Le programme doit être validé avant téléchargement." }, { status: 409 });

    if ((formation.creation_mode ?? "selen_form") !== "selen_form") return NextResponse.json({ error: "Le PDF structuré est réservé aux programmes Selen." }, { status: 409 });

    const { data: organisation, error: organisationError } = userId ? await admin.from("daily_onboarding").select("organisation_name,address,platform_contact_email").eq("user_id", userId).maybeSingle() : { data: null, error: null };
    if (organisationError) throw organisationError;
    const bytes = renderRegistrationProgramPdf(formation, organisation);
    return new Response(bytes,{status:200,headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="programme-${safe(clean(formation.title))}.pdf"`,"Cache-Control":"private, no-store"}});
  } catch {
    return NextResponse.json({ error: "Impossible de lire le programme." }, { status: 500 });
  }
}
