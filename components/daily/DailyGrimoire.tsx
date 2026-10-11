"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

type Role = "organisation" | "learner" | "trainer";
type Tab = "journey" | "faq";
type Entry = { theme: string; title: string; detail: string; href?: string; action?: string };
type Props = { role: Role; portalBasePath?: string; raised?: boolean };

const roleLabels: Record<Role, string> = {
  organisation: "organisme de formation",
  learner: "apprenant",
  trainer: "formateur",
};

function organisationEntries(): Entry[] {
  return [
    { theme: "Avant", title: "Préparer l’offre et les sessions", detail: "Créez ou importez la formation, configurez positionnement et prérequis, puis ouvrez une session. Selen conserve le dossier administratif ; l’OF valide les informations métier.", href: "/client/daily/formations", action: "Ouvrir les formations" },
    { theme: "Avant", title: "Inscrire et suivre les participants", detail: "Ajoutez un apprenant ou une entreprise, suivez chaque dossier individuel et vérifiez les actions encore réellement ouvertes.", href: "/client/daily/sessions", action: "Ouvrir les sessions" },
    { theme: "Avant", title: "Contrôler les candidatures", detail: "Positionnement, besoins, prérequis et décisions restent rattachés au dossier concerné. Une action terminée quitte la liste active mais reste dans l’historique.", href: "/client/daily/candidatures", action: "Voir les candidatures" },
    { theme: "Pendant", title: "Suivre présences et incidents", detail: "Les créneaux d’émargement suivent les horaires réels de la session. L’OF contrôle les absences et les éléments de suivi sans se substituer au formateur.", href: "/client/daily/presences", action: "Voir les présences" },
    { theme: "Pendant", title: "Partager les documents utiles", detail: "Publiez uniquement les ressources prévues pour la bonne session et le bon destinataire. Les accès restent limités au périmètre autorisé.", href: "/client/daily/documents-apprenants", action: "Gérer les ressources" },
    { theme: "Après", title: "Clôturer avec les preuves réelles", detail: "Vérifiez évaluation, satisfaction, documents de fin et indicateurs. Les rappels s’arrêtent dès que l’action est réalisée.", href: "/client/daily/documents-fin", action: "Ouvrir les documents de fin" },
    { theme: "Pilotage", title: "Comprendre les automatisations", detail: "Selen prépare les notifications et retire les tâches devenues sans objet. Une tâche humaine n’apparaît que lorsqu’une décision ou une action reste à faire.", href: "/client/daily/a-faire", action: "Voir mes actions" },
  ];
}

function learnerEntries(base: string): Entry[] {
  return [
    { theme: "Avant", title: "Consulter ma session", detail: "Retrouvez les dates, le lieu, votre programme et les documents publiés pour votre inscription.", href: base, action: "Mon espace" },
    { theme: "Avant", title: "Faire mon positionnement", detail: "Répondez au questionnaire demandé. Les justificatifs de prérequis apparaissent seulement s’ils sont configurés pour votre dossier.", href: `${base}/positionnement`, action: "Ouvrir le positionnement" },
    { theme: "Pendant", title: "Émarger mes créneaux", detail: "Chaque émargement s’ouvre selon l’horaire réel de la session. Un créneau non ouvert reste indisponible ; un oubli peut rester accessible dans l’historique.", href: `${base}/presence`, action: "Voir mes présences" },
    { theme: "Après", title: "Compléter mon évaluation", detail: "L’évaluation devient disponible au moment prévu par la session et reste limitée à votre inscription.", href: `${base}/evaluation`, action: "Ouvrir l’évaluation" },
    { theme: "Après", title: "Donner mon avis", detail: "Le questionnaire de satisfaction permet de transmettre votre note et vos remarques après la formation.", href: `${base}/learner-satisfaction`, action: "Donner mon avis" },
    { theme: "À tout moment", title: "Signaler une difficulté", detail: "Une réclamation ou suggestion est transmise par le canal prévu, sans exposer le dossier d’un autre participant.", href: `${base}/feedback`, action: "Réclamation / suggestion" },
  ];
}

function trainerEntries(base: string, portal: boolean): Entry[] {
  if (portal) return [
    { theme: "Avant", title: "Vérifier la session", detail: "Consultez uniquement la session et les participants qui vous sont attribués, ainsi que les documents utiles à votre intervention.", href: base, action: "Mon espace" },
    { theme: "Pendant", title: "Suivre les présences", detail: "Contrôlez les créneaux réels et accompagnez les apprenants sans signer à leur place.", href: `${base}/presence`, action: "Voir les présences" },
    { theme: "Pendant", title: "Tracer un fait utile", detail: "La fiche de suivi sert aux incidents, adaptations et actions réellement engagées pendant la session.", href: base, action: "Compléter le suivi" },
    { theme: "Après", title: "Transmettre mon retour", detail: "Complétez votre satisfaction formateur lorsque la session est terminée.", href: `${base}/satisfaction`, action: "Donner mon retour" },
    { theme: "À tout moment", title: "Signaler une difficulté", detail: "Utilisez le formulaire prévu pour une réclamation ou une suggestion liée à votre intervention.", href: `${base}/feedback`, action: "Réclamation / suggestion" },
  ];
  return [
    { theme: "Mon profil", title: "Tenir mon profil à jour", detail: "Complétez votre CV et vos informations professionnelles depuis votre espace formateur.", href: "/client/daily/formateur/cv", action: "Mon CV" },
    { theme: "Avant", title: "Préparer mes sessions", detail: "Consultez uniquement les sessions qui vous sont affectées et les informations pédagogiques autorisées.", href: "/client/daily/formateur/suivi-sessions", action: "Mes sessions" },
    { theme: "Pendant", title: "Tracer le suivi", detail: "Ajoutez incidents, adaptations et suites utiles dans la fiche de la session concernée.", href: "/client/daily/formateur/suivi-sessions", action: "Ouvrir le suivi" },
    { theme: "Conformité", title: "Maintenir mes justificatifs", detail: "Les certifications et échéances restent rattachées à votre profil et à votre organisme.", href: "/client/daily/formateur/certifications", action: "Mes certifications" },
  ];
}

const faq: Record<Role, Entry[]> = {
  organisation: [
    { theme: "Tâches", title: "Pourquoi une tâche a-t-elle disparu ?", detail: "Parce qu’elle est terminée, annulée ou devenue sans objet. Elle n’alimente plus les listes actives ni les compteurs, mais son historique peut rester visible dans le parcours." },
    { theme: "Rôles", title: "Qui fait quoi dans Selen Daily ?", detail: "L’OF renseigne et valide ses données métier ; l’apprenant réalise ses actions personnelles ; le formateur suit la session qui lui est attribuée ; Selen automatise les rappels et prépare les tâches qui nécessitent encore une action humaine." },
    { theme: "Notifications", title: "Quand les emails sont-ils envoyés ?", detail: "Seulement lorsqu’un flux opérationnel le prévoit. Les tests ne déclenchent pas d’envoi client réel et les relances cessent dès que l’action est accomplie." },
    { theme: "Données", title: "Puis-je voir les dossiers d’un autre organisme ?", detail: "Non. Les écrans et actions Daily sont bornés à votre organisme et aux sessions autorisées." },
    { theme: "Aide", title: "Où signaler une difficulté ?", detail: "Utilisez la page Réclamations pour transmettre un problème ou une suggestion à Selen.", href: "/client/daily/reclamations", action: "Ouvrir Réclamations" },
  ],
  learner: [
    { theme: "Accès", title: "Pourquoi une action est-elle encore « À venir » ?", detail: "Elle n’est pas encore ouverte selon les dates ou l’avancement réel de votre session. Vous n’avez rien à faire tant qu’elle reste verrouillée." },
    { theme: "Documents", title: "Où trouver ma convocation et mon programme ?", detail: "Dans votre espace de session, rubrique documents. Seuls les documents autorisés pour votre inscription y apparaissent." },
    { theme: "Prérequis", title: "Puis-je remplacer une pièce refusée ?", detail: "Oui lorsque le dossier vous propose explicitement le remplacement. La nouvelle pièce reste rattachée à votre inscription." },
    { theme: "Présence", title: "Pourquoi ne puis-je pas encore émarger ?", detail: "Le créneau s’ouvre selon l’horaire réel de la session. Vérifiez la date et l’heure affichées avant de réessayer." },
    { theme: "Confidentialité", title: "Les autres apprenants voient-ils mes réponses ?", detail: "Non. Votre portail est limité à votre inscription et ne donne pas accès aux données d’un autre participant." },
  ],
  trainer: [
    { theme: "Accès", title: "Pourquoi une session n’apparaît-elle pas ?", detail: "L’espace formateur ne montre que les sessions auxquelles vous êtes affecté. L’OF doit vérifier votre rattachement si une session manque." },
    { theme: "Présence", title: "Puis-je émarger à la place d’un apprenant ?", detail: "Non. Vous accompagnez et contrôlez le suivi ; chaque apprenant réalise son propre émargement dans son périmètre." },
    { theme: "Suivi", title: "Que faut-il inscrire dans la fiche de suivi ?", detail: "Uniquement les faits utiles : difficulté, adaptation, incident et action engagée. Évitez les notes personnelles sans utilité pédagogique ou administrative." },
    { theme: "Données", title: "Puis-je consulter tous les apprenants de l’OF ?", detail: "Non. Seuls les participants des sessions qui vous sont attribuées sont accessibles." },
    { theme: "Fin", title: "Que faire après la session ?", detail: "Complétez votre retour formateur et vérifiez que les éléments de suivi utiles ont été consignés." },
  ],
};

function contextHelp(role: Role, pathname: string): string {
  if (role === "organisation") {
    if (pathname.includes("/sessions")) return "Ici, suivez les inscrits, les acteurs, les preuves et les actions de chaque session.";
    if (pathname.includes("/formations")) return "Ici, préparez le programme, le positionnement et les prérequis avant d’ouvrir les inscriptions.";
    if (pathname.includes("/candidatures")) return "Ici, contrôlez chaque dossier sans mélanger les candidats ni les organismes.";
    if (pathname.includes("/presences")) return "Ici, vérifiez les émargements sur les créneaux réels de la session.";
    if (pathname.includes("/a-faire")) return "Ici, seules les actions humaines encore nécessaires restent actives.";
    return "Le Grimoire vous guide dans le parcours administratif Avant, Pendant et Après formation.";
  }
  if (role === "learner") return pathname.endsWith("/positionnement") ? "Complétez ici votre positionnement et les pièces explicitement demandées." : pathname.endsWith("/presence") ? "Émargez ici uniquement les créneaux actuellement ouverts." : "Retrouvez ici les actions et documents limités à votre propre inscription.";
  return pathname.includes("suivi-sessions") || pathname.includes("/portail/") ? "Consultez ici vos sessions autorisées et consignez seulement les faits utiles au suivi." : "Votre espace formateur reste limité à votre profil et à vos sessions affectées.";
}

export default function DailyGrimoire({ role, portalBasePath, raised = false }: Props) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("journey");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase("fr"));
  const entries = useMemo(() => role === "organisation" ? organisationEntries() : role === "learner" ? learnerEntries(portalBasePath ?? pathname) : trainerEntries(portalBasePath ?? "/client/daily/formateur", Boolean(portalBasePath)), [pathname, portalBasePath, role]);
  const source = tab === "journey" ? entries : faq[role];
  const visible = useMemo(() => deferredQuery ? source.filter((entry) => `${entry.theme} ${entry.title} ${entry.detail}`.toLocaleLowerCase("fr").includes(deferredQuery)) : source, [deferredQuery, source]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open]);

  return <div className={`daily-grimoire${raised ? " raised" : ""}`}>
    {open ? <section id="daily-grimoire-panel" className="daily-grimoire-panel" role="dialog" aria-modal="false" aria-labelledby="daily-grimoire-title">
      <header className="daily-grimoire-head"><div><small>Aide-mémoire · {roleLabels[role]}</small><h2 id="daily-grimoire-title">Grimoire Daily</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Fermer le Grimoire">×</button></header>
      <p className="daily-grimoire-context"><strong>Sur cet écran :</strong> {contextHelp(role, pathname)}</p>
      <div className="daily-grimoire-tabs" role="tablist" aria-label="Rubriques du Grimoire">
        <button type="button" role="tab" aria-selected={tab === "journey"} onClick={() => setTab("journey")}>Mon parcours</button>
        <button type="button" role="tab" aria-selected={tab === "faq"} onClick={() => setTab("faq")}>Questions fréquentes</button>
      </div>
      <label className="daily-grimoire-search"><span>Rechercher dans l’aide</span><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ex. émargement, document, tâche…" /></label>
      <p className="daily-grimoire-count" aria-live="polite">{visible.length} résultat{visible.length > 1 ? "s" : ""}</p>
      <div className="daily-grimoire-results" role="tabpanel">{visible.map((entry) => <details key={`${entry.theme}:${entry.title}`}><summary><span>{entry.theme}</span>{entry.title}</summary><p>{entry.detail}</p>{entry.href ? <a href={entry.href}>{entry.action ?? "Ouvrir l’action"} →</a> : null}</details>)}{visible.length === 0 ? <p>Aucun résultat. Essayez un autre mot.</p> : null}</div>
    </section> : null}
    <button type="button" className="daily-grimoire-trigger" aria-expanded={open} aria-controls="daily-grimoire-panel" onClick={() => setOpen((current) => !current)}><span aria-hidden="true">✦</span> Grimoire</button>
    <style jsx>{`
      .daily-grimoire{position:fixed;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));z-index:70;font-family:"EB Garamond",Georgia,serif}.daily-grimoire.raised{bottom:7rem}.daily-grimoire-trigger{min-height:46px;padding:.65rem .9rem;border:1px solid #8a4b24;background:#8a4b24;color:#fff8e8;font:800 .72rem "Cinzel",serif;letter-spacing:.08em;text-transform:uppercase;box-shadow:0 8px 24px rgba(62,42,31,.22);cursor:pointer}.daily-grimoire-trigger:focus-visible,.daily-grimoire button:focus-visible,.daily-grimoire a:focus-visible,.daily-grimoire input:focus-visible{outline:3px solid #d7a540;outline-offset:2px}.daily-grimoire-panel{position:absolute;right:0;bottom:58px;width:min(430px,calc(100vw - 28px));max-height:min(72vh,680px);display:grid;grid-template-rows:auto auto auto auto auto minmax(0,1fr);overflow:hidden;border:1px solid #9d734c;background:#fffaf0;color:#3e2a1f;box-shadow:0 18px 48px rgba(62,42,31,.28)}.daily-grimoire-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:1rem 1rem .75rem;background:#eee0c8;border-bottom:1px solid #c8a87a}.daily-grimoire-head small{font:700 .64rem "Cinzel",serif;text-transform:uppercase;letter-spacing:.08em;color:#8a4b24}.daily-grimoire-head h2{margin:.2rem 0 0;font:700 1.45rem "Playfair Display",Georgia,serif}.daily-grimoire-head button{border:0;background:transparent;color:#5a3b29;font-size:1.7rem;line-height:1;cursor:pointer}.daily-grimoire-context{margin:0;padding:.8rem 1rem;background:#fff4df;border-bottom:1px solid #e0c8a3;font-size:.92rem;line-height:1.4}.daily-grimoire-tabs{display:grid;grid-template-columns:1fr 1fr;padding:.75rem 1rem 0;gap:6px}.daily-grimoire-tabs button{min-height:42px;border:1px solid #b99169;background:#fffaf0;color:#5a3b29;font-weight:800;cursor:pointer}.daily-grimoire-tabs button[aria-selected="true"]{background:#8a4b24;color:#fff8e8;border-color:#8a4b24}.daily-grimoire-search{display:grid;gap:4px;padding:.7rem 1rem .2rem;font-weight:800;font-size:.85rem}.daily-grimoire-search input{min-height:42px;padding:.55rem .65rem;border:1px solid #b99169;background:#fff;color:#3e2a1f;font:inherit}.daily-grimoire-count{margin:.3rem 1rem;font-size:.8rem;color:#76573d}.daily-grimoire-results{overflow:auto;padding:.15rem 1rem 1rem;overscroll-behavior:contain}.daily-grimoire-results details{border:1px solid #d6bb93;background:#fffdf8;margin-top:.55rem}.daily-grimoire-results summary{padding:.75rem;cursor:pointer;font-weight:800;line-height:1.35}.daily-grimoire-results summary span{display:block;margin-bottom:.2rem;color:#8a4b24;font:700 .6rem "Cinzel",serif;text-transform:uppercase;letter-spacing:.08em}.daily-grimoire-results details p{margin:0;padding:0 .75rem .65rem;line-height:1.5;color:#5f4938}.daily-grimoire-results details a{display:inline-block;margin:0 .75rem .8rem;color:#8a4b24;font-weight:800}.daily-grimoire-results details[open] summary{border-bottom:1px solid #ead8bb;background:#fff6e6}@media(max-width:640px){.daily-grimoire,.daily-grimoire.raised{right:12px;bottom:12px}.daily-grimoire-panel{position:fixed;right:12px;bottom:70px;max-height:calc(100dvh - 92px)}.daily-grimoire-trigger{min-height:48px}.daily-grimoire-results{content-visibility:auto}}
    `}</style>
  </div>;
}
