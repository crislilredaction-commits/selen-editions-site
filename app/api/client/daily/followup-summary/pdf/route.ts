import { jsPDF } from "jspdf";
import { NextResponse } from "next/server";
import { getDailyOrganisationReadContext } from "@/lib/server/dailyOrganisationContext";
import { loadDailySessionFollowupSnapshot } from "@/lib/server/dailySessionFollowupSummary";

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
    .slice(0, 80) || "session";
}

function formationTitle(session: any) {
  const formation = Array.isArray(session?.daily_formations) ? session.daily_formations[0] : session?.daily_formations;
  return text(formation?.title) || text(session?.internal_reference) || "Session Daily";
}

function frDate(value: unknown) {
  const raw = text(value);
  if (!raw) return "Non renseignée";
  const date = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date) : raw;
}

function frDateTime(value: unknown) {
  const raw = text(value);
  if (!raw) return "Date non renseignée";
  const date = new Date(raw);
  return Number.isFinite(date.getTime()) ? new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(date) : raw;
}

export const runtime = "nodejs";

export async function GET(request: Request) {
  const context = await getDailyOrganisationReadContext(request, ["sessions"]);
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (!context.assisted && !context.capabilities?.sessions) return NextResponse.json({ error: "Accès au suivi de session indisponible." }, { status: 403 });

  const sessionId = new URL(request.url).searchParams.get("session_id")?.trim();
  if (!sessionId) return NextResponse.json({ error: "Session requise." }, { status: 400 });

  try {
    const snapshot = await loadDailySessionFollowupSnapshot(context.admin, context.organisationId, sessionId);
    const { session, organisation, summary, entries, enrolments } = snapshot;
    const title = formationTitle(session);
    const organisationName = text(organisation?.legal_name || organisation?.name) || "Organisme de formation";
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
    const metric = (label: string, value: string) => {
      ensureSpace(8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(label, left, y);
      doc.setFont("helvetica", "normal");
      doc.text(value, right, y, { align: "right" });
      y += 6;
    };

    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    doc.text("Fiche de suivi de session", left, y);
    y += 9;
    paragraph(title, { bold: true, size: 13, gap: 2 });
    paragraph(organisationName, { size: 10, gap: 1 });
    paragraph(`Session : ${text(session.internal_reference) || "Sans référence"} · ${frDate(session.start_date)} au ${frDate(session.end_date)}`, { size: 9, gap: 5 });

    doc.setDrawColor(180);
    doc.line(left, y, right, y);
    y += 7;
    paragraph("Récapitulatif", { bold: true, size: 12, gap: 4 });
    metric("Apprenants actifs", String(summary.learners.active));
    metric("Émargements renseignés", `${summary.attendance.decided}/${summary.attendance.total}`);
    metric("Évaluations finales", `${summary.assessments.completed}/${summary.assessments.expected}`);
    const rating = summary.satisfaction.average_rating;
    metric("Satisfaction apprenants", `${summary.satisfaction.responses}/${summary.satisfaction.expected}${rating === null ? "" : ` · moyenne ${rating.toFixed(1)}/5`}`);
    metric("Suivis", `${summary.followup.open} ouvert(s) · ${summary.followup.resolved} traité(s)`);
    metric("Événements", `${summary.followup.incidents} incident(s) · ${summary.followup.adaptations} adaptation(s)`);

    y += 3;
    paragraph("Apprenants", { bold: true, size: 12, gap: 3 });
    if (enrolments.length === 0) paragraph("Aucun apprenant actif.", { size: 9 });
    else enrolments.forEach((item: any) => paragraph(`• ${item.name}`, { size: 9, gap: 1 }));

    y += 3;
    paragraph("Historique du suivi", { bold: true, size: 12, gap: 4 });
    if (entries.length === 0) {
      paragraph("Aucun incident ni adaptation n’a été consigné pour cette session.", { size: 9 });
    } else {
      for (const entry of entries) {
        ensureSpace(28);
        const kind = entry.entry_type === "adaptation" ? "Adaptation" : entry.entry_type === "incident" ? "Incident" : "Note";
        paragraph(`${kind} · ${text(entry.summary) || "Sans résumé"}`, { bold: true, size: 10, gap: 1 });
        paragraph(`${frDateTime(entry.occurred_at)} · ${text(entry.level) || "information"} · ${entry.status === "resolved" ? "Traité" : "Ouvert"}${entry.learner_name ? ` · ${entry.learner_name}` : ""}`, { size: 8, gap: 1 });
        paragraph(`Ajouté par : ${text(entry.author_name) || "Auteur non renseigné (historique antérieur)"}${entry.author_role ? ` · ${entry.author_role}` : ""}`, { size: 8, gap: 2 });
        if (text(entry.description)) paragraph(`Contexte : ${text(entry.description)}`, { size: 9, gap: 1 });
        if (text(entry.action_taken)) paragraph(`Action : ${text(entry.action_taken)}`, { size: 9, gap: 1 });
        y += 2;
      }
    }

    ensureSpace(16);
    y += 4;
    doc.setDrawColor(200);
    doc.line(left, y, right, y);
    y += 6;
    paragraph(`Document généré depuis Selen Daily le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date())}. Les informations sont calculées à partir du dossier de session existant.`, { size: 8 });

    const bytes = doc.output("arraybuffer");
    const filename = `fiche-suivi-${safeFilename(title)}.pdf`;
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Génération du PDF impossible.";
    return NextResponse.json({ error: message }, { status: message === "Session introuvable." ? 404 : 500 });
  }
}
