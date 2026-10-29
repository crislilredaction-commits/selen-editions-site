"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import LoadingMascot from "@/components/ui/LoadingMascot";

type TemplateRow = { id: string; document_type: string; template_name: string; template_version: number; status: string };
type Org = Record<string, unknown>;
type StandardModel = { type: string; name: string; description: string; content: string };

const STANDARD_MODELS: StandardModel[] = [
  {
    type: "training_program",
    name: "Programme de formation",
    description: "Programme de référence de l’action de formation.",
    content: `PROGRAMME DE FORMATION\n\nOrganisme : {{organisme}}\nBénéficiaire : {{beneficiaire}}\n\nLe programme présente l’intitulé, les objectifs, le public concerné, les prérequis, la durée, le contenu détaillé, les méthodes et moyens pédagogiques, les modalités d’évaluation, les modalités d’inscription, le délai d’accès ainsi que les conditions d’accessibilité définies pour l’action de formation concernée. Les informations propres à la formation et au bénéficiaire sont reprises automatiquement depuis le dossier Daily au moment de la génération.`,
  },
  {
    type: "training_agreement",
    name: "Convention de formation",
    description: "Convention de formation professionnelle avec clauses standard Selen.",
    content: `CONVENTION DE FORMATION PROFESSIONNELLE\n\nEntre {{organisme}} et {{client}}.\n\nLa présente convention a pour objet de définir les conditions dans lesquelles l’organisme assure l’action de formation convenue avec le client. Les caractéristiques précises de l’action, ses dates, sa durée, son prix, son programme, ses modalités pédagogiques, les moyens mobilisés et les modalités d’évaluation sont repris automatiquement depuis le dossier de formation au moment de la génération.\n\nLe client s’engage à transmettre les informations nécessaires à la bonne organisation de la formation et à informer l’organisme de toute situation susceptible d’avoir une incidence sur son déroulement.\n\nL’organisme met en œuvre les moyens pédagogiques, techniques et humains nécessaires à la réalisation de l’action et assure la traçabilité réglementaire des présences, évaluations et documents de fin de formation.\n\nLes conditions financières, modalités d’annulation, de report, d’interruption et de règlement applicables sont celles définies dans les conditions contractuelles de l’organisme et reprises dans le dossier de la session concernée.\n\nFait en deux exemplaires.\n\nSignature de l’organisme                         Signature du client`,
  },
  {
    type: "training_contract",
    name: "Contrat de formation professionnelle",
    description: "Contrat destiné à la personne physique qui finance elle-même sa formation.",
    content: `CONTRAT DE FORMATION PROFESSIONNELLE\n\nEntre {{organisme}} et {{stagiaire}}, personne physique entreprenant la formation à titre individuel et à ses frais.\n\nLe présent contrat est conclu avant l’inscription définitive et tout règlement. Il décrit l’action de formation concernée, ses objectifs, son programme, sa durée, ses prérequis, ses modalités d’organisation, les moyens pédagogiques et techniques, les modalités de contrôle des connaissances, la sanction éventuelle ainsi que les titres ou références des formateurs. Ces informations sont reprises automatiquement depuis le dossier de formation au moment de la génération.\n\nLe prix et l’échéancier de paiement figurent dans le dossier contractuel associé à la session. Aucun paiement ne peut être exigé avant l’expiration du délai légal de rétractation. À l’issue de ce délai, le premier versement ne peut excéder la part autorisée par la réglementation ; le solde est échelonné au fur et à mesure du déroulement de l’action.\n\nEn cas de cessation anticipée ou d’abandon hors cas de force majeure, les conditions financières prévues au dossier contractuel s’appliquent. En cas de force majeure dûment reconnue empêchant le stagiaire de poursuivre la formation, seules les prestations effectivement dispensées sont dues à proportion de leur valeur prévue au contrat.\n\nSignature du stagiaire                         Signature de l’organisme`,
  },
  {
    type: "convocation",
    name: "Convocation",
    description: "Convocation adressée au bénéficiaire.",
    content: `CONVOCATION À UNE FORMATION\n\nBonjour {{apprenant}},\n\nVous êtes convoqué(e) à l’action de formation indiquée dans votre dossier. Les dates, horaires, lieu ou accès distanciel, ainsi que les informations pratiques sont ajoutés automatiquement lors de la génération du document.\n\nMerci de signaler en amont tout besoin particulier ou difficulté d’accès à {{organisme}}.`,
  },
  {
    type: "attendance_sheet",
    name: "Feuille d’émargement",
    description: "Suivi des présences et signatures.",
    content: `FEUILLE D’ÉMARGEMENT\n\nOrganisme : {{organisme}}\nBénéficiaire : {{apprenant}}\n\nLes informations de session, dates, horaires, formateur et lignes de signature sont ajoutées automatiquement depuis le dossier de formation.`,
  },
  {
    type: "training_certificate",
    name: "Attestation de formation",
    description: "Attestation de suivi remise au bénéficiaire.",
    content: `ATTESTATION DE FORMATION\n\nJe soussigné(e), représentant {{organisme}}, atteste que {{apprenant}} a suivi l’action de formation renseignée dans son dossier. Les dates et la durée effectivement réalisées sont ajoutées automatiquement lors de la génération du document.\n\nSignature et cachet de l’organisme`,
  },
  {
    type: "completion_certificate",
    name: "Certificat de réalisation",
    description: "Certificat de réalisation de l’action de formation.",
    content: `CERTIFICAT DE RÉALISATION\n\n{{organisme}} certifie que {{apprenant}} a réalisé l’action de formation renseignée dans son dossier. Les dates, la durée et la modalité sont ajoutées automatiquement à partir des données de la session.\n\nSignature de l’organisme`,
  },
  {
    type: "rules",
    name: "Règlement intérieur",
    description: "Règlement intérieur standard de l’organisme de formation.",
    content: `RÈGLEMENT INTÉRIEUR\n\nOrganisme : {{organisme}}\n\nObjet et champ d’application\nLe présent règlement s’applique à toute personne participant à une action de formation organisée par l’organisme. Il précise les règles relatives à l’hygiène, à la sécurité et à la discipline applicables pendant la formation.\n\nHygiène et sécurité\nChaque participant doit respecter les consignes de sécurité applicables dans les locaux ou sur le site d’accueil. Tout accident, incident ou situation dangereuse doit être signalé sans délai à l’organisme ou au formateur.\n\nDiscipline et comportement\nLes participants doivent adopter un comportement respectueux des personnes, des locaux, du matériel et du bon déroulement de la formation. Les violences, menaces, comportements discriminatoires, harcèlements et atteintes à la dignité ne sont pas admis.\n\nAbsences et retards\nToute absence ou retard doit être signalé dès que possible. Les présences sont tracées selon les modalités prévues pour la session.\n\nUtilisation du matériel\nLe matériel mis à disposition doit être utilisé conformément à sa destination et aux consignes données.\n\nSanctions et garanties disciplinaires\nTout manquement peut donner lieu à une mesure adaptée à sa gravité dans le respect des garanties prévues par la réglementation applicable à la formation professionnelle.\n\nRéclamations et signalements\nToute difficulté, réclamation ou situation nécessitant un signalement peut être portée à la connaissance de {{organisme}} par les moyens de contact figurant dans le dossier de formation.`,
  },
  {
    type: "disability_policy",
    name: "Politique PSH",
    description: "Processus d’accueil et d’accompagnement des personnes en situation de handicap, avec ressources régionales.",
    content: `POLITIQUE D’ACCUEIL DES PERSONNES EN SITUATION DE HANDICAP\n\nOrganisme : {{organisme}}\n\n1. Principe d’accueil\nL’organisme accueille les personnes en situation de handicap dans le respect de l’égalité d’accès à la formation. Toute demande d’adaptation est étudiée individuellement, avec la personne concernée, afin d’identifier les besoins utiles au parcours sans présumer de leur nature ni imposer la transmission d’informations médicales non nécessaires.\n\n2. Signalement des besoins\nLe bénéficiaire peut signaler un besoin d’adaptation lors de l’inscription ou à tout moment du parcours. Le référent handicap ou la personne chargée du suivi analyse la demande, échange avec le bénéficiaire et vérifie avec l’équipe pédagogique les adaptations raisonnablement mobilisables.\n\n3. Analyse et mise en œuvre\nSelon la situation, les adaptations peuvent concerner les rythmes, horaires, supports, modalités pédagogiques, outils numériques, conditions d’évaluation, accessibilité des locaux ou recours à une aide humaine ou technique. Lorsque l’organisme ne dispose pas seul de l’expertise nécessaire, il sollicite les ressources compétentes avec l’accord du bénéficiaire.\n\n4. Traçabilité et confidentialité\nLes adaptations retenues sont tracées dans le dossier de suivi uniquement dans la mesure nécessaire à leur mise en œuvre. Les informations relatives au handicap sont traitées de manière confidentielle et ne sont communiquées qu’aux personnes qui doivent en connaître pour sécuriser le parcours.\n\n5. Suivi pendant la formation\nL’efficacité des adaptations est réévaluée en cours de formation. Toute difficulté nouvelle peut conduire à ajuster les mesures prévues ou à solliciter un partenaire spécialisé.\n\nRESSOURCE HANDICAP FORMATION — CONTACTS RÉGIONAUX AGEFIPH (mise à jour officielle 09/01/2026)\nAuvergne-Rhône-Alpes : rhf-ara@agefiph.asso.fr\nBourgogne-Franche-Comté : rhf-bfc@agefiph.asso.fr\nBretagne : rhf-bretagne@agefiph.asso.fr\nCentre-Val de Loire : rhf-centre@agefiph.asso.fr\nCorse : contact@rhf-corse.fr — 06 28 58 71 33 / 06 72 79 24 43\nGrand Est : rhf-grand-est@agefiph.asso.fr — 06 76 57 21 68 / 07 85 22 70 99\nHauts-de-France : rhf-hdf@agefiph.asso.fr — 03 22 54 26 80\nÎle-de-France : rhf-idf@agefiph.asso.fr\nNormandie : accueil.rhf@rhf-normandie.fr — 02 31 93 64 86\nNouvelle-Aquitaine : rhf-nouvelle-aquitaine@crfh-handicap.fr — 05 57 29 20 12\nOccitanie : rhf-occitanie@agefiph.asso.fr — 05 62 47 88 38\nPays de la Loire : rhf-pays-de-la-loire@agefiph.asso.fr — 02 40 48 30 66\nProvence-Alpes-Côte d’Azur : rhf-provence-alpes-cotedazur@agefiph.asso.fr — 04 42 93 15 50\nGuadeloupe : rhf-guadeloupe@agefiph.asso.fr — 06 90 65 05 15\nGuyane : rhf-guyane@lvconsultants.fr — 06 94 95 79 29\nMartinique : rhfmartinique@agefma.fr — 05 96 71 11 04 / 06 96 08 68 63\nLa Réunion-Mayotte : rhf-lareunion-mayotte@agefiph.asso.fr — 06 93 99 41 64\n\nANNUAIRES OFFICIELS À UTILISER SELON LE LIEU DE RÉSIDENCE OU DE FORMATION\nAgefiph — coordonnées régionales : https://www.agefiph.fr/contacter-l-agefiph\nRessource Handicap Formation : https://www.agefiph.fr/services/ressource-handicap-formation\nMDPH — annuaire départemental : https://www.monparcourshandicap.gouv.fr/annuaire\nCap Emploi — réseau et annuaire : https://www.cheops-ops.org/\nFIPHFP — contacts et délégations territoriales : https://www.fiphfp.fr/nous-contacter\n\nCette politique est remise avec le livret d’accueil et doit rester accessible depuis le dossier d’inscription du bénéficiaire.`,
  },
  {
    type: "welcome_booklet",
    name: "Livret d’accueil",
    description: "Informations pratiques remises aux bénéficiaires.",
    content: `LIVRET D’ACCUEIL\n\nBienvenue chez {{organisme}}.\n\nCe livret présente le fonctionnement général de l’organisme de formation et les principaux repères utiles pendant votre parcours.\n\nAvant la formation\nVous recevez les informations relatives à votre action de formation, ses modalités d’accès, son organisation et les documents utiles à votre participation.\n\nPendant la formation\nLe formateur vous accompagne dans votre progression. Les présences, évaluations et éventuelles adaptations nécessaires sont suivies tout au long de la session.\n\nAccessibilité et besoins particuliers\nTout besoin particulier peut être signalé avant ou pendant la formation afin d’étudier les adaptations possibles avec le bénéficiaire et, lorsque nécessaire, les partenaires compétents. La politique PSH de l’organisme est annexée au livret d’accueil et reste consultable depuis le dossier d’inscription.\n\nRéclamations et difficultés\nToute difficulté rencontrée pendant le parcours peut être signalée à {{organisme}}. Les réclamations sont enregistrées, analysées et traitées dans le cadre de la procédure qualité de l’organisme.\n\nConfidentialité et données personnelles\nLes informations recueillies dans le cadre de la formation sont utilisées uniquement pour la gestion, le suivi, la conformité et l’amélioration de la prestation, selon les règles applicables en matière de protection des données.`,
  },
];

const text = (v: unknown) => String(v ?? "").trim();

function htmlDoc(model: StandardModel, content: string, org: Org) {
  const name = text(org.legal_name || org.name) || "Votre organisme";
  const siret = text(org.siret);
  const nda = text(org.nda_number);
  const address = text(org.address);
  const logo = text(org.logo_url || org.organisation_logo_url);
  const safeContent = content.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return `<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Georgia,serif;color:#30251e;margin:42px;line-height:1.5}.head{border-bottom:2px solid #b28a62;padding-bottom:14px;margin-bottom:28px}.logo{max-height:70px;max-width:180px}.content{white-space:pre-wrap}.foot{border-top:1px solid #b28a62;margin-top:40px;padding-top:10px;font-size:10pt;color:#6a5849}</style></head><body><div class="head">${logo ? `<img class="logo" src="${logo}" alt="">` : ""}<h1>${model.name}</h1></div><div class="content">${safeContent}</div><div class="foot"><strong>${name}</strong>${address ? ` · ${address}` : ""}${siret ? ` · SIRET ${siret}` : ""}${nda ? ` · NDA ${nda}` : ""}</div></body></html>`;
}

function downloadWord(model: StandardModel, org: Org) {
  const blob = new Blob([htmlDoc(model, model.content, org)], { type: "application/msword" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${model.type}.doc`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function DailyDocumentTemplatesPage() {
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [org, setOrg] = useState<Org>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StandardModel | null>(null);
  const [content, setContent] = useState("");
  const [documentType, setDocumentType] = useState("training_agreement");
  const [templateName, setTemplateName] = useState("Convention de formation");
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const [a, b] = await Promise.all([
        fetch("/api/client/daily/document-templates", { cache: "no-store" }),
        fetch("/api/client/daily/workspace", { cache: "no-store" }),
      ]);
      const [ta, wb] = await Promise.all([a.json().catch(() => ({})), b.json().catch(() => ({}))]);
      if (!a.ok) throw new Error(ta.error ?? "Impossible de charger les modèles.");
      if (!b.ok) throw new Error(wb.error ?? "Impossible de charger l'organisme.");
      setTemplates(ta.templates ?? []);
      setOrg(wb.workspace?.organisation ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Chargement impossible.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);
  const filtered = useMemo(() => STANDARD_MODELS.filter((m) => `${m.name} ${m.description}`.toLowerCase().includes(query.toLowerCase())), [query]);

  function openEditor(model: StandardModel) {
    setSelected(model);
    setContent(model.content);
    setMessage("");
    setError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveEdited() {
    if (!selected) return;
    setSaving(true); setError(""); setMessage("");
    try {
      const file = new File([htmlDoc(selected, content, org)], `${selected.type}.doc`, { type: "application/msword" });
      const fd = new FormData();
      fd.set("file", file); fd.set("document_type", selected.type); fd.set("template_name", selected.name);
      const r = await fetch("/api/client/daily/document-templates", { method: "POST", body: fd });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? "Enregistrement impossible.");
      setMessage("Votre modèle personnalisé est enregistré et devient la version active.");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Enregistrement impossible.");
    } finally { setSaving(false); }
  }

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError("Choisissez un fichier Word ou PDF."); return; }
    setSaving(true); setError(""); setMessage("");
    const body = new FormData();
    body.set("file", file); body.set("document_type", documentType); body.set("template_name", templateName || documentType);
    const res = await fetch("/api/client/daily/document-templates", { method: "POST", body });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "Enregistrement impossible.");
    else { setMessage("Modèle remplacé/importé. La nouvelle version devient active."); if (fileRef.current) fileRef.current.value = ""; await load(); }
    setSaving(false);
  }

  async function archive(id: string) {
    setError("");
    const res = await fetch(`/api/client/daily/document-templates?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.error ?? "Archivage impossible."); else await load();
  }

  if (loading) return <LoadingMascot message="Sélion ouvre vos modèles de documents…" />;

  return <main style={s.page}><div style={s.wrap}>
    <header style={s.hero}>
      <p style={s.kicker}>Gestion documentaire · Modèles</p>
      <h1 style={s.h1}>Modèles de documents</h1>
      <p style={s.lead}>Tous les modèles sont regroupés dans une seule liste. Le contenu juridique et pratique standard est déjà rédigé ; seules les données provenant réellement de l’organisme, du bénéficiaire ou du dossier sont fusionnées automatiquement au moment de la génération.</p>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une convention, un contrat, un livret…" style={s.search} />
    </header>
    {error ? <p style={s.error}>{error}</p> : null}
    {message ? <p style={s.success}>{message}</p> : null}

    {selected ? <section style={s.card}>
      <div style={s.head}><div><p style={s.kicker}>Édition du modèle</p><h2 style={s.h2}>{selected.name}</h2></div><button type="button" onClick={() => setSelected(null)} style={s.compactSecondary}>Fermer</button></div>
      <p style={s.note}>Le texte standard est rédigé en dur. Les doubles accolades restantes correspondent uniquement à des données injectées automatiquement depuis le dossier ; elles n’ont pas vocation à être saisies manuellement ici.</p>
      <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={18} style={s.editor} />
      <button type="button" disabled={saving} onClick={() => void saveEdited()} style={s.compactPrimary}>{saving ? "Enregistrement…" : "Enregistrer ma version"}</button>
    </section> : null}

    <section style={s.modelGrid}>{filtered.map((model) => {
      const current = templates.find((t) => t.document_type === model.type);
      return <article key={model.type} style={s.card}>
        <p style={s.kicker}>{current ? `Votre version · v${current.template_version}` : "Modèle Selen"}</p>
        <h2 style={s.h2}>{model.name}</h2>
        <p style={s.note}>{model.description}</p>
        <div style={s.actions}>
          <button type="button" onClick={() => downloadWord(model, org)} style={s.compactSecondary}>Télécharger</button>
          <button type="button" onClick={() => openEditor(model)} style={s.compactPrimary}>Modifier</button>
          {current ? <a href={`/api/client/daily/document-templates?id=${encodeURIComponent(current.id)}`} target="_blank" rel="noreferrer" style={s.compactLink}>Votre version</a> : null}
        </div>
      </article>;
    })}</section>

    <details style={s.card}><summary style={s.summary}>Remplacer ou importer un modèle Word / PDF</summary><div style={{ marginTop: "1rem" }}>
      <p style={s.note}>Choisissez le type de document puis importez votre propre fichier. La version précédente reste historisée.</p>
      <div style={s.formGrid}>
        <label style={s.field}><span style={s.label}>Type de document</span><select value={documentType} onChange={(e) => { const v = e.target.value; setDocumentType(v); const found = STANDARD_MODELS.find((x) => x.type === v); if (found) setTemplateName(found.name); }} style={s.input}>{STANDARD_MODELS.map((m) => <option key={m.type} value={m.type}>{m.name}</option>)}</select></label>
        <label style={s.field}><span style={s.label}>Nom du modèle</span><input value={templateName} onChange={(e) => setTemplateName(e.target.value)} style={s.input} /></label>
      </div>
      <div style={s.uploadRow}><input ref={fileRef} type="file" accept=".pdf,.doc,.docx" style={s.file} /><button type="button" onClick={() => void upload()} disabled={saving} style={s.compactPrimary}>{saving ? "Enregistrement…" : "Importer"}</button></div>
    </div></details>

    <section style={s.card}><h2 style={s.h2}>Vos versions actives</h2>{templates.length === 0 ? <p style={s.empty}>Aucune version personnalisée enregistrée pour le moment.</p> : <div style={s.list}>{templates.map((item) => <article key={item.id} style={s.row}><div><strong>{item.template_name}</strong><p style={s.meta}>{item.document_type} · version {item.template_version}</p></div><div style={s.actions}><a href={`/api/client/daily/document-templates?id=${encodeURIComponent(item.id)}`} target="_blank" rel="noreferrer" style={s.compactLink}>Télécharger</a><button type="button" onClick={() => void archive(item.id)} style={s.compactSecondary}>Archiver</button></div></article>)}</div>}</section>
  </div></main>;
}

const s: Record<string, React.CSSProperties> = {
  page: { minHeight: "100vh", padding: "2rem 1rem 5rem", color: "#392a19" },
  wrap: { maxWidth: 1120, margin: "0 auto", display: "grid", gap: "1rem" },
  hero: { background: "rgba(248,240,220,.9)", border: "1px solid #d9c391", padding: "1.7rem 1.9rem" },
  kicker: { textTransform: "uppercase", letterSpacing: ".14em", fontSize: 11, fontWeight: 800, color: "#9b682d", margin: 0 },
  h1: { fontSize: "clamp(2rem,5vw,3rem)", margin: ".35rem 0" },
  h2: { marginTop: 0 },
  lead: { color: "#725e46", lineHeight: 1.6, maxWidth: 860 },
  note: { color: "#725e46", lineHeight: 1.55 },
  card: { background: "rgba(248,240,220,.9)", border: "1px solid #d9c391", padding: "1.25rem 1.35rem", boxShadow: "0 8px 20px rgba(57,42,25,.06)" },
  search: { width: "100%", boxSizing: "border-box", padding: ".72rem", marginTop: ".8rem", border: "1px solid #cdb785", background: "#fffaf0" },
  modelGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))", gap: ".8rem" },
  head: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" },
  actions: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginTop: 10 },
  compactPrimary: { minHeight: 34, border: "1px solid #7a2e22", background: "#7a2e22", color: "#fff8e8", padding: ".4rem .65rem", fontSize: 13, fontWeight: 800, borderRadius: 4 },
  compactSecondary: { minHeight: 34, border: "1px solid #cdb785", background: "#fffaf0", color: "#392a19", padding: ".4rem .65rem", fontSize: 13, fontWeight: 800, borderRadius: 4 },
  compactLink: { minHeight: 34, display: "inline-flex", alignItems: "center", color: "#7a2e22", fontSize: 13, fontWeight: 800, padding: "0 .25rem" },
  editor: { width: "100%", boxSizing: "border-box", padding: 12, fontFamily: "monospace", lineHeight: 1.5, border: "1px solid #cdb785", background: "#fffaf0" },
  formGrid: { display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))", gap: "1rem" },
  field: { display: "grid", gap: 6 },
  label: { fontSize: 12, fontWeight: 800, color: "#806c52" },
  input: { border: "1px solid #cdb785", background: "#fffaf0", padding: ".7rem" },
  uploadRow: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12 },
  file: { maxWidth: "100%" },
  summary: { cursor: "pointer", fontWeight: 800 },
  list: { display: "grid", gap: 8 },
  row: { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap", borderTop: "1px solid #e2d3ad", paddingTop: 10 },
  meta: { margin: ".2rem 0 0", color: "#806c52", fontSize: 12 },
  empty: { color: "#806c52" },
  error: { padding: 10, border: "1px solid #a64b3b", background: "#fff2ee", color: "#7d2e22" },
  success: { padding: 10, border: "1px solid #7c9b68", background: "#f3faef", color: "#385c2d" },
};
