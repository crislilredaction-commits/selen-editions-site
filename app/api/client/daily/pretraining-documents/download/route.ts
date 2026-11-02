import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";

export async function GET(req:Request) {
  const context = await getDailyOrganisationContext(req,"sessions",{allowAssistanceRead:true});
  if (!context.ok) return NextResponse.json({error:context.error},{status:context.status});
  const id = new URL(req.url).searchParams.get("id") ?? "";
  const privateHeaders = {"Cache-Control":"private, no-store"};
  if (!id) return NextResponse.json({error:"Document manquant."},{status:400,headers:privateHeaders});
  // A missing (or replaced) document is not a database outage. single()
  // turns zero rows into PGRST116 and previously displayed a misleading 503.
  const { data:document,error } = await context.admin.from("daily_documents").select("id,organisation_id,document_type,bucket,storage_path,logical_name,version").eq("id",id).eq("organisation_id",context.organisationId).in("document_type",["training_program","training_agreement","training_contract","convocation","registration_positioning","welcome_booklet","internal_regulations"]).eq("is_current",true).maybeSingle();
  if (error) return NextResponse.json({error:"Lecture des documents temporairement indisponible."},{status:503,headers:privateHeaders});
  if (!document) return NextResponse.json({error:"Document introuvable."},{status:404,headers:privateHeaders});
  // Never ask storage to sign an empty or malformed document location.
  if (typeof document.bucket !== "string" || !document.bucket.trim()
    || typeof document.storage_path !== "string" || !document.storage_path.trim()) {
    return NextResponse.json({error:"Téléchargement indisponible."},{status:503,headers:privateHeaders});
  }
  try {
    const { data:signed,error:signError } = await context.admin.storage.from(document.bucket).createSignedUrl(document.storage_path,120);
    if (signError || !signed?.signedUrl) return NextResponse.json({error:"Téléchargement indisponible."},{status:503,headers:privateHeaders});
    return NextResponse.redirect(signed.signedUrl,{headers:privateHeaders});
  } catch {
    return NextResponse.json({error:"Téléchargement indisponible."},{status:503,headers:privateHeaders});
  }
}
