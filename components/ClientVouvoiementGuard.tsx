"use client";

import { useEffect } from "react";

const replacements: Array<[string, string]> = [
  ["Choisis comment tu préfères paramétrer ton espace. Tu pourras revenir plus tard, chaque champ est sauvegardé automatiquement.", "Choisissez comment vous préférez paramétrer votre espace. Vous pourrez revenir plus tard, chaque champ est sauvegardé automatiquement."],
  ["Aucun souci. Quand le moment viendra, Selen pourra t'aider à préparer le chemin vers Qualiopi.", "Aucun souci. Quand le moment viendra, Selen pourra vous aider à préparer le chemin vers Qualiopi."],
  ["Plus tu utilises Selen au fil de l'eau, moins tu cours après les preuves au moment de l'audit.", "Plus vous utilisez Selen au fil de l'eau, moins vous courez après les preuves au moment de l'audit."],
  ["Ton espace Daily est prêt à démarrer", "Votre espace Daily est prêt à démarrer"],
  ["Tu pourras modifier ces informations plus tard depuis les paramètres Daily. La prochaine étape utile : créer ta première formation.", "Vous pourrez modifier ces informations plus tard depuis les paramètres Daily. La prochaine étape utile : créer votre première formation."],
  ["Tu peux changer d'avis à tout moment. Les informations déjà saisies sont conservées et aideront Selen à préparer le rendez-vous.", "Vous pouvez changer d'avis à tout moment. Les informations déjà saisies sont conservées et aideront Selen à préparer le rendez-vous."],
  ["Continue à transmettre les informations et documents disponibles. Le rendez-vous pourra être planifié au minimum 24 h après leur transmission.", "Continuez à transmettre les informations et documents disponibles. Le rendez-vous pourra être planifié au minimum 24 h après leur transmission."],
];

function normalize(root: ParentNode) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    let value = node.nodeValue ?? "";
    let next = value;
    for (const [from, to] of replacements) next = next.replaceAll(from, to);
    if (next !== value) node.nodeValue = next;
  }
}

export default function ClientVouvoiementGuard() {
  useEffect(() => {
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
  }, []);
  return null;
}
