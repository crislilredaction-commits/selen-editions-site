import { NextResponse } from "next/server";
import { getAssignedDailyTrainerSession, getDailyTrainerWorkspaceContext } from "@/lib/server/dailyTrainerWorkspaceContext";

const text = (value: unknown) => String(value ?? "").trim();
const escapeHtml = (value: unknown) => text(value).replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char] ?? char);

export async function GET(request: Request) {
  // Use the same personal identity and organisation boundary as the trainer workspace.
  // A shared email address must never select an arbitrary trainer profile.
  const context = await getDailyTrainerWorkspaceContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });

  const sessionId = text(new URL(request.url).searchParams.get("session_id"));
  if (!sessionId) return NextResponse.json({ error: "Session requise." }, { status: 400 });
  const session = await getAssignedDailyTrainerSession(context, sessionId);
  if (!session) return NextResponse.json({ error: "Session non affectée à ce formateur." }, { status: 404 });

  const [slotsResult, enrolmentsResult] = await Promise.all([
    context.admin.from("daily_attendance_slots")
      .select("id,slot_date,starts_at,ends_at,label,status")
      .eq("organisation_id", context.orgId).eq("session_id", sessionId)
      .neq("status", "cancelled").order("slot_date").order("starts_at"),
    context.admin.from("daily_session_enrolments")
      .select("id,status,daily_learners(first_name,last_name,email)")
      .eq("organisation_id", context.orgId).eq("session_id", sessionId)
      .not("status", "in", "(cancelled,declined,abandoned)"),
  ]);
  if (slotsResult.error || enrolmentsResult.error) {
    return NextResponse.json({ error: "Impossible de préparer la feuille d’émargement." }, { status: 500 });
  }
  const slots = slotsResult.data ?? [];
  const enrolments = enrolmentsResult.data ?? [];
  if (!slots.length || !enrolments.length) {
    return NextResponse.json({ error: "Aucun créneau actif ou apprenant inscrit pour cette session." }, { status: 409 });
  }

  const formation = Array.isArray(session.daily_formations) ? session.daily_formations[0] : session.daily_formations;
  const rows = enrolments.map((enrolment) => {
    const learner = Array.isArray(enrolment.daily_learners) ? enrolment.daily_learners[0] : enrolment.daily_learners;
    const name = [learner?.first_name, learner?.last_name].filter(Boolean).join(" ") || learner?.email;
    const cells = slots.map((slot) => `<td>${escapeHtml(slot.slot_date)}<br>${escapeHtml(text(slot.starts_at).slice(0, 5))}-${escapeHtml(text(slot.ends_at).slice(0, 5))}<br><br>Signature :</td>`).join("");
    return `<tr><td>${escapeHtml(name)}</td>${cells}</tr>`;
  }).join("");
  const headers = slots.map((slot) => `<th>${escapeHtml(slot.label || "Créneau")}</th>`).join("");
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><style>body{font-family:Arial;margin:28px}table{border-collapse:collapse;width:100%}th,td{border:1px solid #555;padding:10px;vertical-align:top}h1{font-size:22px}</style></head><body><h1>Feuille d’émargement · ${escapeHtml(formation?.title || session.internal_reference || "Session")}</h1><p>Formateur : ${escapeHtml(context.trainerName)} · Session : ${escapeHtml(session.internal_reference)}</p><table><thead><tr><th>Apprenant</th>${headers}</tr></thead><tbody>${rows}</tbody></table></body></html>`;
  return new NextResponse(html, { headers: {
    "Content-Type": "application/msword;charset=utf-8",
    "Content-Disposition": `attachment; filename="feuille-emargement-${sessionId.slice(0, 8)}.doc"`,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
  } });
}
