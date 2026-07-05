"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const MESSAGES = [
  "Sélion prépare votre bureau…",
  "Les parchemins se rangent doucement…",
  "Selen rassemble les éléments de votre dossier…",
  "La plume vérifie les derniers détails…",
  "Votre espace s’ouvre dans un instant…",
  "Les documents prennent place dans le grimoire…",
];

export default function LoadingMascot({
  fullScreen = true,
  message,
}: {
  fullScreen?: boolean;
  message?: string;
}) {
  const [index, setIndex] = useState(0);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (message) return;

    const interval = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % MESSAGES.length);
    }, 2600);

    return () => window.clearInterval(interval);
  }, [message]);

  return (
    <div
      className={[
        "gazette-paper flex flex-col items-center justify-center gap-6 px-6 text-center",
        fullScreen ? "min-h-screen" : "py-20",
      ].join(" ")}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="animate-float-soft rounded-full bg-[#f7efe2]/70 p-4 shadow-[0_18px_45px_rgba(72,45,29,0.14)] ring-1 ring-[#d8b982]/40">
        {imageError ? (
          <div className="flex h-[96px] w-[96px] items-center justify-center text-5xl">
            🦁
          </div>
        ) : (
          <Image
            src="/selion.png"
            alt="Sélion, mascotte Selen"
            width={120}
            height={120}
            onError={() => setImageError(true)}
            className="drop-shadow-[0_10px_28px_rgba(178,138,98,0.35)]"
          />
        )}
      </div>

      <div className="gazette-dot-rule w-56">
        <span>✦</span>
      </div>

      <p
        key={message ?? index}
        className="loading-message max-w-md font-['Cinzel'] text-xs uppercase tracking-[0.2em] text-[#5a4031] md:text-sm"
      >
        {message ?? MESSAGES[index]}
      </p>

      <span className="sr-only">Chargement en cours</span>
    </div>
  );
}
