import { NextResponse } from "next/server";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";

type CertificationRow = {
  id: string;
  trainer_profile_id: string;
  title: string;
  issuer: string | null;
  reference: string | null;
  obtained_on: string | null;
  validity_mode: string | null;
  valid_until: string | null;
  note: string | null;
};

type ProofRow = {
  id: string;
  linked_object_id: string | null;
  logical_name: string | null;
  bucket: string | null;
  storage_path: string | null;
  mime_type: string | null;
  size_bytes: number | null;
};

export async function GET(req: Request) {
  const context = await getDailyOrganisationReadContext(req, ["trainers"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const { admin, organisationId } = context;
  const { data: trainers, error: trainerError } = await admin
    .from("daily_trainer_profiles")
    .select("id,display_name,professional_email,status,specialties")
    .eq("organisation_id", organisationId)
    .eq("active", true)
    .order("display_name", { ascending: true });
  if (trainerError) return NextResponse.json({ error: trainerError.message }, { status: 500 });

  const trainerIds = (trainers ?? []).map((trainer) => trainer.id).filter(Boolean);
  if (trainerIds.length === 0) {
    return NextResponse.json({ trainers: [], assisted: context.assisted });
  }

  const { data: certificationData, error: certificationError } = await admin
    .from("daily_trainer_certifications")
    .select("id,trainer_profile_id,title,issuer,reference,obtained_on,validity_mode,valid_until,note")
    .in("trainer_profile_id", trainerIds)
    .order("title", { ascending: true });
  if (certificationError) return NextResponse.json({ error: certificationError.message }, { status: 500 });

  const certifications = (certificationData ?? []) as CertificationRow[];
  const certificationIds = certifications.map((certification) => certification.id);
  let proofs: ProofRow[] = [];

  if (certificationIds.length > 0) {
    const { data: proofData, error: proofError } = await admin
      .from("daily_documents")
      .select("id,linked_object_id,logical_name,bucket,storage_path,mime_type,size_bytes")
      .eq("organisation_id", organisationId)
      .eq("document_type", "trainer_qualification_proof")
      .eq("linked_object_type", "trainer_certification")
      .eq("is_current", true)
      .eq("status", "active")
      .in("linked_object_id", certificationIds);
    if (proofError) return NextResponse.json({ error: proofError.message }, { status: 500 });
    proofs = (proofData ?? []) as ProofRow[];
  }

  const proofByCertification = new Map<string, ProofRow>();
  for (const proof of proofs) {
    if (proof.linked_object_id) proofByCertification.set(proof.linked_object_id, proof);
  }

  const certificationsByTrainer = new Map<string, Array<Record<string, unknown>>>();
  for (const certification of certifications) {
    const proof = proofByCertification.get(certification.id) ?? null;
    let proofPayload: Record<string, unknown> | null = null;
    if (proof?.bucket && proof.storage_path) {
      const { data: signed } = await admin.storage.from(proof.bucket).createSignedUrl(proof.storage_path, 600);
      if (signed?.signedUrl) {
        proofPayload = {
          id: proof.id,
          name: proof.logical_name || "Justificatif",
          mime_type: proof.mime_type,
          size_bytes: proof.size_bytes,
          url: signed.signedUrl,
          expires_in_seconds: 600,
        };
      }
    }

    const list = certificationsByTrainer.get(certification.trainer_profile_id) ?? [];
    list.push({ ...certification, proof: proofPayload });
    certificationsByTrainer.set(certification.trainer_profile_id, list);
  }

  return NextResponse.json({
    assisted: context.assisted,
    trainers: (trainers ?? []).map((trainer) => ({
      ...trainer,
      certifications: certificationsByTrainer.get(trainer.id) ?? [],
    })),
  });
}
