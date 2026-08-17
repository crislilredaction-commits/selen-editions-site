import { jsPDF } from "jspdf";
import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/server/clientNdaAccess";
import { getDailyClientWorkspace } from "@/lib/server/dailyClientWorkspace";

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function formatDate(value: unknown) {
  const raw = clean(value);
  if (!raw) return "";
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? raw : new Intl.DateTimeFormat("fr-FR").format(date);
}

function safeFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "formateur";
}

type PdfWriter = {
  doc: jsPDF;
  y: number;
};

function ensureSpace(writer: PdfWriter, needed = 18) {
  if (writer.y + needed <= 278) return;
  writer.doc.addPage();
  writer.y = 20;
}

function addHeading(writer: PdfWriter, title: string) {
  ensureSpace(writer, 16);
  writer.doc.setFont("helvetica", "bold");
  writer.doc.setFontSize(13);
  writer.doc.text(title, 20, writer.y);
  writer.y += 7;
}

function addParagraph(writer: PdfWriter, value: unknown, emptyLabel = "Non renseigné") {
  const text = clean(value) || emptyLabel;
  writer.doc.setFont("helvetica", "normal");
  writer.doc.setFontSize(10);
  const lines = writer.doc.splitTextToSize(text, 170) as string[];
  for (const line of lines) {
    ensureSpace(writer, 6);
    writer.doc.text(line, 20, writer.y);
    writer.y += 5;
  }
  writer.y += 3;
}

function addTrainingList(writer: PdfWriter, rows: Array<Record<string, unknown>>, kind: "completed" | "planned") {
  const selected = rows.filter((row) => row.training_kind === kind);
  if (selected.length === 0) {
    addParagraph(writer, kind === "completed" ? "Aucune formation suivie déclarée." : "Aucune formation envisagée déclarée.");
    return;
  }

  for (const row of selected) {
    const parts = [clean(row.title) || "Formation", clean(row.provider), formatDate(row.completed_on), clean(row.note)].filter(Boolean);
    const suffix = kind === "completed" && row.attestation_document_id ? " · attestation reçue" : "";
    addParagraph(writer, `• ${parts.join(" · ")}${suffix}`, "");
  }
}

export async function GET(req: Request) {
  const context = await getDailyClientWorkspace();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.workspace.capabilities.trainers_all) {
    return NextResponse.json({ error: "Vous n’avez pas accès au suivi de l’ensemble des formateurs." }, { status: 403 });
  }

  const reviewId = new URL(req.url).searchParams.get("review_id")?.trim();
  if (!reviewId) return NextResponse.json({ error: "Auto-évaluation requise." }, { status: 400 });

  const admin = getAdminSupabase();
  const { data: review, error: reviewError } = await admin
    .from("daily_trainer_annual_reviews")
    .select("id,trainer_profile_id,review_year,status,strengths,weaknesses,improvement_areas,proposed_solutions,submitted_at,manager_appreciation,manager_improvement_areas,manager_actions,manager_completed_at")
    .eq("id", reviewId)
    .maybeSingle();

  if (reviewError) return NextResponse.json({ error: reviewError.message }, { status: 500 });
  if (!review || review.status !== "submitted") {
    return NextResponse.json({ error: "Le document final est disponible après transmission de l’auto-évaluation." }, { status: 409 });
  }

  const { data: trainer, error: trainerError } = await admin
    .from("daily_trainer_profiles")
    .select("id,display_name,professional_email,specialties")
    .eq("id", review.trainer_profile_id)
    .eq("organisation_id", context.workspace.membership.organisation_id)
    .maybeSingle();

  if (trainerError) return NextResponse.json({ error: trainerError.message }, { status: 500 });
  if (!trainer) return NextResponse.json({ error: "Cette auto-évaluation n’appartient pas à votre organisme." }, { status: 403 });

  const { data: trainings, error: trainingError } = await admin
    .from("daily_trainer_annual_review_trainings")
    .select("training_kind,title,provider,completed_on,attestation_document_id,note")
    .eq("annual_review_id", review.id)
    .order("created_at", { ascending: true });

  if (trainingError) return NextResponse.json({ error: trainingError.message }, { status: 500 });

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const writer: PdfWriter = { doc, y: 20 };
  doc.setProperties({
    title: `Auto-évaluation annuelle ${review.review_year} - ${clean(trainer.display_name) || "Formateur"}`,
    subject: "Suivi annuel des compétences formateur - Selen Daily",
  });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text("Suivi annuel des compétences", 20, writer.y);
  writer.y += 8;
  doc.setFontSize(12);
  doc.text(`Auto-évaluation ${review.review_year}`, 20, writer.y);
  writer.y += 10;

  addHeading(writer, "Formateur");
  addParagraph(writer, clean(trainer.display_name) || "Formateur");
  if (clean(trainer.professional_email)) addParagraph(writer, trainer.professional_email, "");
  if (Array.isArray(trainer.specialties) && trainer.specialties.length > 0) {
    addParagraph(writer, `Compétences / spécialités : ${trainer.specialties.join(", ")}`, "");
  }
  addParagraph(writer, `Auto-évaluation transmise le ${formatDate(review.submitted_at)}`, "");

  addHeading(writer, "Points forts");
  addParagraph(writer, review.strengths);
  addHeading(writer, "Points faibles / difficultés");
  addParagraph(writer, review.weaknesses);
  addHeading(writer, "Axes d’amélioration");
  addParagraph(writer, review.improvement_areas);
  addHeading(writer, "Solutions proposées");
  addParagraph(writer, review.proposed_solutions);

  addHeading(writer, "Formations suivies dans l’année écoulée");
  addTrainingList(writer, trainings ?? [], "completed");
  addHeading(writer, "Formations envisagées pour l’année à venir");
  addTrainingList(writer, trainings ?? [], "planned");

  const managerAppreciation = clean(review.manager_appreciation);
  const managerImprovementAreas = clean(review.manager_improvement_areas);
  const managerActions = clean(review.manager_actions);
  const hasManagerContribution = Boolean(managerAppreciation || managerImprovementAreas || managerActions);

  if (hasManagerContribution) {
    ensureSpace(writer, 24);
    writer.y += 3;
    addHeading(writer, "Contribution facultative du dirigeant");
    if (managerAppreciation) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Appréciation", 20, writer.y);
      writer.y += 5;
      addParagraph(writer, managerAppreciation, "");
    }
    if (managerImprovementAreas) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Axes d’amélioration confirmés ou ajustés", 20, writer.y);
      writer.y += 5;
      addParagraph(writer, managerImprovementAreas, "");
    }
    if (managerActions) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text("Actions proposées ou décidées", 20, writer.y);
      writer.y += 5;
      addParagraph(writer, managerActions, "");
    }
    if (review.manager_completed_at) addParagraph(writer, `Contribution enregistrée le ${formatDate(review.manager_completed_at)}`, "");
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`Selen Daily · ${review.review_year} · page ${page}/${pageCount}`, 20, 290);
  }

  const pdf = doc.output("arraybuffer");
  const filename = `suivi-annuel-${safeFilename(clean(trainer.display_name))}-${review.review_year}.pdf`;
  return new Response(pdf, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
