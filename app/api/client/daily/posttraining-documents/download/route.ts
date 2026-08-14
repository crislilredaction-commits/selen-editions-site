import { NextResponse } from "next/server";
import { getDailyOrganisationContext } from "@/lib/server/dailyOrganisationContext";

const documentTypes = ["attendance_report","completion_certificate","satisfaction_summary"];

export async function GET(req:Request) {
  const context = await getDailyOrganisationContext(req,"sessions",{allowAssistanceRead:true});
  if (!context.ok) return NextResponse.json({error:context.error},{status:context.status});
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({error:"Document manquant."},{status:400});
  const { data:document,error } = await context.admin
    .from("daily_documents")
    .select("id,organisation_id,document_type,bucket,storage_path,logical_name,version")
    .eq("id",id)
    .eq("organisation_id",context.organisationId)
    .in("document_type",documentTypes)
    .maybeSingle();
  if (error || !document) return NextResponse.json({error:"Document introuvable."},{status:404});
  const { data:signed,error:signError } = await context.admin.storage.from(document.bucket).createSignedUrl(document.storage_path,120);
  if (signError || !signed?.signedUrl) return NextResponse.json({error:"Téléchargement indisponible."},{status:500});
  return NextResponse.redirect(signed.signedUrl);
}
