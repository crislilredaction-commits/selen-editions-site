"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

const DAILY_PATH_PREFIX = "/client/daily";

const replacements: Array<[string, string]> = [
  ["Choisis comment tu préfères paramétrer ton espace. Tu pourras revenir plus tard, chaque champ est sauvegardé automatiquement.", "Choisissez comment vous préférez paramétrer votre espace. Vous pourrez revenir plus tard, chaque champ est sauvegardé automatiquement."],
  ["Aucun souci. Quand le moment viendra, Selen pourra t'aider à préparer le chemin vers Qualiopi.", "Aucun souci. Quand le moment viendra, Selen pourra vous aider à préparer le chemin vers Qualiopi."],
  ["Plus tu utilises Selen au fil de l'eau, moins tu cours après les preuves au moment de l'audit.", "Plus vous utilisez Selen au fil de l'eau, moins vous courez après les preuves au moment de l'audit."],
  ["Ton espace Daily est prêt à démarrer", "Votre espace Daily est prêt à démarrer"],
  ["Tu pourras modifier ces informations plus tard depuis les paramètres Daily. La prochaine étape utile : créer ta première formation.", "Vous pourrez modifier ces informations plus tard depuis les paramètres Daily. La prochaine étape utile : créer votre première formation."],
  ["Tu peux changer d'avis à tout moment. Les informations déjà saisies sont conservées et aideront Selen à préparer le rendez-vous.", "Vous pouvez changer d'avis à tout moment. Les informations déjà saisies sont conservées et aideront Selen à préparer le rendez-vous."],
  ["Continue à transmettre les informations et documents disponibles. Le rendez-vous pourra être planifié au minimum 24 h après leur transmission.", "Continuez à transmettre les informations et documents disponibles. Le rendez-vous pourra être planifié au minimum 24 h après leur transmission."],
  ["Brouillon · vérification Selen", "Brouillon"],
  ["En validation Selen", "En validation"],
  ["Selen Studio", "Selen"],
  ["Créez vos programmes, transmettez-les à Selen pour validation et conservez automatiquement leurs versions.", "Créez vos programmes, envoyez-les en validation et conservez automatiquement leurs versions."],
  ["Nouvelle version envoyée à Selen. La version validée actuelle reste publiée jusqu’à validation.", "Nouvelle version envoyée en validation. La version validée actuelle reste publiée jusqu’à validation."],
  ["Formation mise à jour et renvoyée à Selen pour vérification.", "Formation mise à jour et renvoyée en vérification."],
  ["La version actuellement validée reste publiée et conserve son lien d’inscription jusqu’à ce que Selen valide vos modifications.", "La version actuellement validée reste publiée et conserve son lien d’inscription jusqu’à validation de vos modifications."],
  ["Retour Selen :", "Corrections demandées :"],
];

function normalize(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    const value = node.nodeValue ?? "";
    let next = value;
    for (const [from, to] of replacements) next = next.replaceAll(from, to);
    if (next !== value) node.nodeValue = next;
  }

  if (root instanceof HTMLElement || root === document.body) {
    const scope = root instanceof HTMLElement ? root : document.body;
    for (const paragraph of Array.from(scope.querySelectorAll("p"))) {
      const text = paragraph.textContent?.trim() ?? "";
      if (text.startsWith("Corrections demandées :") && paragraph.closest("article")) {
        paragraph.remove();
      }
    }
  }
}

export default function ClientVouvoiementGuard() {
  const pathname = usePathname();

  useEffect(() => {
    if (!pathname.startsWith(DAILY_PATH_PREFIX)) return;

    normalize(document.body);
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const added of mutation.addedNodes) {
          if (added.nodeType === Node.TEXT_NODE) normalize(added.parentNode ?? document.body);
          else if (added instanceof HTMLElement) normalize(added);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
