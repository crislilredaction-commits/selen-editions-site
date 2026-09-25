import { jsPDF } from "jspdf";
import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

type Params = { params: Promise<{ token: string }> };
const clean = (v: unknown) => String(v ?? "").trim();
const safe = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 80) || "formation";
const fields = "id,user_id,title,status,global_objective,target_audience,prerequisites,duration_hours,duration_days,modality,modality_details,access_delays,registration_methods,price,detailed_program,accessibility,pedagogical_resources,pedagogical_methods,evaluation_methods,contact_phone,contact_email,contact_website";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: Params) {
  const token = clean((await params).token);
  if (!token) return NextResponse.json({ error: "Lien invalide." }, { status: 400 });
  const admin = getAdminSupabase();
  const { data: session } = await admin.from("daily_sessions").select(`user_id,daily_formations(${fields})`).eq("registration_token", token).neq("status", "archived").maybeSingle();
  let formation: any = session ? (Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations) : null;
  let userId = session?.user_id ?? null;
  if (!formation) {
    const { data } = await admin.from("daily_formations").select(`public_registration_enabled,public_registration_token,${fields}`).eq("public_registration_token", token).eq("public_registration_enabled", true).neq("status", "archived").maybeSingle();
    formation = data;
    userId = data?.user_id ?? null;
  }
  if (!formation) return NextResponse.json({ error: "Programme introuvable." }, { status: 404 });
  if (formation.status !== "validated") return NextResponse.json({ error: "Le programme doit être validé avant téléchargement." }, { status: 409 });

  const { data: organisation } = userId ? await admin.from("daily_onboarding").select("organisation_name,address,platform_contact_email").eq("user_id", userId).maybeSingle() : { data: null };
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left=16, right=194, width=right-left; let y=18;
  const ensure=(n=16)=>{ if(y+n>278){ doc.addPage(); y=18; } };
  const p=(value: unknown, bold=false, size=10)=>{ const s=clean(value); if(!s)return; ensure(14); doc.setFont("helvetica",bold?"bold":"normal"); doc.setFontSize(size); const lines=doc.splitTextToSize(s,width); doc.text(lines,left,y); y+=lines.length*size*0.42+3; };
  const section=(label:string,value:unknown)=>{ if(!clean(value))return; ensure(20); p(label,true,11); p(value,false,10); };
  p(clean(organisation?.organisation_name)||"Organisme de formation",true,11);
  p("PROGRAMME DE FORMATION",true,18);
  p(formation.title,true,14);
  if(organisation?.address)p(organisation.address,false,9);
  if(organisation?.platform_contact_email)p(organisation.platform_contact_email,false,9);
  y+=3;
  section("Objectif général",formation.global_objective);
  section("Public concerné",formation.target_audience);
  section("Prérequis",formation.prerequisites);
  section("Durée",[formation.duration_hours?`${formation.duration_hours} h`:"",formation.duration_days?`${formation.duration_days} jour(s)`:""].filter(Boolean).join(" · "));
  section("Modalité",formation.modality);
  section("Précisions sur la modalité",formation.modality_details);
  section("Délai d'accès",formation.access_delays);
  section("Modalités d'inscription",formation.registration_methods);
  section("Tarif",formation.price);
  section("Contenu détaillé de la formation",formation.detailed_program);
  section("Méthodes pédagogiques",formation.pedagogical_methods);
  section("Moyens pédagogiques et techniques",formation.pedagogical_resources);
  section("Modalités d'évaluation",formation.evaluation_methods);
  section("Accessibilité",formation.accessibility);
  ensure(18); y+=4; doc.setDrawColor(190); doc.line(left,y,right,y); y+=6;
  p("Programme validé par l'organisme de formation et généré depuis Selen Daily.",false,8);
  const bytes=doc.output("arraybuffer");
  return new Response(bytes,{status:200,headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="programme-${safe(clean(formation.title))}.pdf"`,"Cache-Control":"private, no-store"}});
}
