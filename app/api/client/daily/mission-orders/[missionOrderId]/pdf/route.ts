import { jsPDF } from "jspdf";
import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";

type Params = { params: Promise<{ missionOrderId: string }> };

const missionLabels: Record<string, string> = {
  conception: "Conception pédagogique",
  animation: "Animation de formation",
  administrative_management: "Gestion administrative",
  evaluation: "Évaluation des acquis",
  learner_followup: "Suivi des apprenants",
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

function safeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80) || "formateur";
}

function frDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "Non renseignée";
  const date = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date)
    : raw;
}

function frDateTime(value: unknown) {
  const raw = text(value);
  if (!raw) return "Date non renseignée";
  const date = new Date(raw);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(date)
    : raw;
}

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: Params) {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const { missionOrderId } = await params;
  const orderId = text(missionOrderId);
  if (!orderId) return NextResponse.json({ error: "Ordre de mission requis." }, { status: 400 });

  const admin = getAdminSupabase();
  const organisationId = context.workspace.membership.organisation_id;
  const canManage = Boolean(context.workspace.capabilities.trainers || context.workspace.capabilities.trainers_all);
  const { data: order, error: orderError } = await admin
    .from("daily_mission_orders")
    .select("*")
    .eq("id", orderId)
    .eq("organisation_id", organisationId)
    .maybeSingle();

  if (orderError) return NextResponse.json({ error: orderError.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Ordre de mission introuvable." }, { status: 404 });
  if (!canManage && order.trainer_user_id !== context.user.id && order.ordering_party_user_id !== context.user.id) {
    return NextResponse.json({ error: "Vous n’avez pas accès à cet ordre de mission." }, { status: 403 });
  }
  if (order.status !== "signed") {
    return NextResponse.json({ error: "Le PDF final n’est disponible qu’après les deux signatures." }, { status: 409 });
  }

  const [{ data: signatures, error: signatureError }, { data: organisation, error: organisationError }] = await Promise.all([
    admin
      .from("daily_mission_order_signatures")
      .select("signatory_type,signatory_name,signatory_email,signature_data,proof_hash,signed_at")
      .eq("mission_order_id", order.id)
      .order("signed_at", { ascending: true }),
    admin
      .from("organisations")
      .select("name,legal_name,siret,address,administrative_address")
      .eq("id", organisationId)
      .maybeSingle(),
  ]);
  if (signatureError) return NextResponse.json({ error: signatureError.message }, { status: 500 });
  if (organisationError) return NextResponse.json({ error: organisationError.message }, { status: 500 });

  const orderingPartySignature = (signatures ?? []).find((row) => row.signatory_type === "ordering_party");
  const trainerSignature = (signatures ?? []).find((row) => row.signatory_type === "trainer");
  if (!orderingPartySignature || !trainerSignature) {
    return NextResponse.json({ error: "Les deux preuves de signature sont requises pour produire le PDF final." }, { status: 409 });
  }

  const organisationName = text(organisation?.legal_name || organisation?.name) || "Organisme de formation";
  const organisationAddress = text(organisation?.administrative_address || organisation?.address);
  const organisationSiret = text(organisation?.siret);
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 16;
  const right = 194;
  const width = right - left;
  let y = 18;

  const ensureSpace = (needed = 16) => {
    if (y + needed <= 278) return;
    doc.addPage();
    y = 18;
  };
  const paragraph = (value: string, options?: { bold?: boolean; size?: number; gap?: number }) => {
    ensureSpace(12);
    doc.setFont("helvetica", options?.bold ? "bold" : "normal");
    doc.setFontSize(options?.size ?? 10);
    const lines = doc.splitTextToSize(value, width);
    doc.text(lines, left, y);
    y += lines.length * ((options?.size ?? 10) * 0.42) + (options?.gap ?? 3);
  };
  const line = (label: string, value: string) => {
    ensureSpace(9);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(label, left, y);
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(value || "Non renseigné", width - 48);
    doc.text(lines, left + 48, y);
    y += Math.max(1, lines.length) * 4.2 + 2;
  };

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("ORDRE DE MISSION", left, y);
  y += 9;
  paragraph("Document final signé électroniquement par les deux parties", { bold: true, size: 11, gap: 5 });

  doc.setDrawColor(180);
  doc.line(left, y, right, y);
  y += 7;
  paragraph("Donneur d’ordre", { bold: true, size: 12, gap: 3 });
  line("Organisme", organisationName);
  line("SIRET", organisationSiret);
  line("Adresse", organisationAddress);

  y += 3;
  paragraph("Formateur / sous-traitant", { bold: true, size: 12, gap: 3 });
  line("Nom", text(order.trainer_name));
  line("Email", text(order.trainer_email));
  line("SIRET", text(order.trainer_siret));
  line("Adresse", text(order.trainer_address));

  y += 3;
  paragraph("Mission confiée", { bold: true, size: 12, gap: 3 });
  line("Type", order.order_type === "collaboration" ? "Collaboration moyenne / longue durée" : "Mission ponctuelle");
  line("Période", `${frDate(order.start_date)} au ${frDate(order.end_date)}`);
  line("Missions", (Array.isArray(order.missions) ? order.missions : []).map((mission: string) => missionLabels[mission] ?? mission).join(" · "));
  if (text(order.mission_details)) line("Précisions", text(order.mission_details));
  line("Tarification", `${text(order.rate_amount)} € HT / ${order.rate_type === "daily" ? "jour" : "heure"}`);
  line("Paiement", text(order.payment_terms));
  line("Déplacements", order.travel_costs_covered ? `Pris en charge${text(order.travel_costs_terms) ? ` · ${text(order.travel_costs_terms)}` : ""}` : "Non pris en charge");
  line("Qualiopi", order.qualiopi_process_commitment ? "Engagement à respecter les processus Qualiopi applicables du donneur d’ordre." : "Aucun engagement spécifique renseigné.");
  line("Établi", `${text(order.issue_place)} · ${frDate(order.issue_date)}`);

  y += 4;
  doc.setDrawColor(180);
  doc.line(left, y, right, y);
  y += 7;
  paragraph("Signatures électroniques et preuves", { bold: true, size: 12, gap: 4 });

  const signatureBlock = (label: string, signature: any) => {
    ensureSpace(36);
    paragraph(label, { bold: true, size: 10, gap: 1 });
    line("Compte", `${text(signature.signatory_name)}${text(signature.signatory_email) ? ` · ${text(signature.signatory_email)}` : ""}`);
    line("Signature saisie", text(signature.signature_data));
    line("Signé le", frDateTime(signature.signed_at));
    line("Preuve SHA-256", text(signature.proof_hash));
    y += 2;
  };

  signatureBlock("Donneur d’ordre", orderingPartySignature);
  signatureBlock("Formateur / sous-traitant", trainerSignature);

  ensureSpace(24);
  doc.setDrawColor(200);
  doc.line(left, y, right, y);
  y += 6;
  paragraph("Le contenu de cet ordre est figé depuis la première signature. Ce PDF est généré à partir de l’ordre final et des deux preuves de signature enregistrées dans Selen Daily.", { size: 8, gap: 2 });
  paragraph(`Document généré le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date())}.`, { size: 8 });

  const bytes = doc.output("arraybuffer");
  const filename = `ordre-mission-${safeFilename(text(order.trainer_name))}-${order.id.slice(0, 8)}.pdf`;
  return new Response(bytes, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
