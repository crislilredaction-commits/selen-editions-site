"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const MESSAGES = [
  "Votre espace avance avec vous : concentrez-vous sur la prochaine action utile, Selen garde le reste bien rangé. ✨",
  "Un document bien classé aujourd'hui, c'est une recherche en moins demain. 📎",
  "Vous n'avez pas besoin de tout traiter en même temps : les priorités importantes restent visibles ici. 🧭",
  "La paperasse adore se multiplier. Heureusement, Selen aime encore plus la ranger. 😌",
  "Votre dossier se construit étape par étape. Quelques minutes maintenant peuvent vous faire gagner beaucoup de temps plus tard. 🌿",
  "Les éléments vraiment urgents remontent en priorité. Le reste peut attendre son tour sans culpabiliser. 🎯",
  "Une session bien préparée, c'est surtout une suite de petites actions simples au bon moment. ☕",
  "Selen veille sur les échéances pendant que vous gardez votre énergie pour la formation. ✨",
  "Vous pouvez avancer sereinement : les preuves, documents et validations restent centralisés dans Daily. 🗂️",
  "Aujourd'hui aussi, objectif simplicité : une action utile à la fois. 🌙",
  "Quand une étape est terminée, Daily la range. Vous n'avez pas à garder toute la checklist en tête. ✅",
  "Votre administratif n'a pas besoin d'être spectaculaire. Il a surtout besoin d'être clair, traçable et à jour. 📚",
];

function seededIndex(pathname: string) {
  const day = new Date().toISOString().slice(0, 10);
  return `${day}:${pathname}`.split("").reduce((sum, char) => sum + char.charCodeAt(0), 0) % MESSAGES.length;
}

export default function DailyFriendlyBanner() {
  const pathname = usePathname();
  const [index, setIndex] = useState(() => seededIndex(pathname));

  useEffect(() => {
    const key = "selen-daily-friendly-history";
    let history: number[] = [];
    try { history = JSON.parse(localStorage.getItem(key) || "[]"); } catch { history = []; }
    let next = seededIndex(pathname);
    for (let attempt = 0; attempt < MESSAGES.length && history.includes(next); attempt += 1) next = (next + 1) % MESSAGES.length;
    localStorage.setItem(key, JSON.stringify([next, ...history.filter((value) => value !== next)].slice(0, 4)));
    setIndex(next);
  }, [pathname]);

  return (
    <div
      style={{
        maxWidth: 980,
        margin: "0 auto",
        padding: "1.15rem 1.25rem .35rem",
        color: "#6d523d",
        fontSize: 16,
        lineHeight: 1.6,
        textAlign: "center",
        fontWeight: 600,
      }}
      aria-live="polite"
    >
      {MESSAGES[index]}
    </div>
  );
}
