import { jsPDF } from "jspdf";
import { projectCandidatureSummary, type CandidatureSummarySource } from "./candidatureSummary";

// Pure, local renderer: no private module, network, storage or original dossier.
export function renderCandidatureSummaryPdf(source: CandidatureSummarySource): ArrayBuffer {
  const summary = projectCandidatureSummary(source);
  if (!summary.available) throw new Error("Synthèse indisponible.");
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const left = 16, width = 178, bottom = 278;
  let y = 18;
  const paragraph = (value: string, bold = false, size = 10) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(size);
    const height = size * 0.42;
    const lines: string[] = doc.splitTextToSize(value.replace(/\r\n?/g, "\n"), width);
    for (const line of lines) {
      if (y + height > bottom) { doc.addPage(); y = 18; }
      doc.text(line, left, y);
      y += height;
    }
    y += 3;
  };
  paragraph("Synthèse Selen de candidature", true, 16);
  paragraph(`Candidat : ${summary.applicant}`);
  paragraph(`Formation : ${summary.formation}`);
  paragraph(`Date de candidature : ${summary.submittedAt}`);
  paragraph(`Date de synthèse : ${summary.analyzedAt}`);
  paragraph(`État : ${summary.status}`);
  for (const section of summary.sections) {
    if (y + 18 > bottom) { doc.addPage(); y = 18; }
    paragraph(section.label, true, 12);
    paragraph(section.value);
  }
  return doc.output("arraybuffer");
}
