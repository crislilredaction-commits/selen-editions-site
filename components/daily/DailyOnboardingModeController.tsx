"use client";

import { useEffect } from "react";

function hideLegacyAssistanceBlocks() {
  const markers = [
    "Préparons d'abord votre rendez-vous",
    "Besoin d'être accompagné finalement",
    "Demande d'accompagnement prise en compte",
  ];
  for (const element of Array.from(document.querySelectorAll("strong"))) {
    const label = element.textContent?.replace(/\s+/g, " ").trim() ?? "";
    if (!markers.some((marker) => label.includes(marker))) continue;
    let node: HTMLElement | null = element.parentElement;
    while (node && node.parentElement && !node.querySelector("button") && node.parentElement.tagName !== "SECTION") node = node.parentElement;
    if (node) node.style.display = "none";
  }
}

export default function DailyOnboardingModeController() {
  useEffect(() => {
    let stepApplied = false;
    const requestedStep = new URLSearchParams(window.location.search).get("step");
    const targetStep = requestedStep === "1" || requestedStep === "2"
      ? requestedStep
      : document.referrer.includes("/client/daily")
        ? "2"
        : null;

    const sync = () => {
      hideLegacyAssistanceBlocks();
      if (!stepApplied && targetStep) {
        const stepButton = Array.from(document.querySelectorAll("button")).find((button) => button.textContent?.trim() === targetStep);
        if (stepButton instanceof HTMLButtonElement) {
          stepApplied = true;
          stepButton.click();
        }
      }
    };

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest("button");
      if (!button) return;
      const label = button.textContent?.replace(/\s+/g, " ").trim() ?? "";
      if (label !== "Je souhaite être accompagné") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      window.location.assign("/client/daily/rendez-vous-parametrage");
    };

    document.addEventListener("click", onClick, true);
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    sync();
    return () => {
      document.removeEventListener("click", onClick, true);
      observer.disconnect();
    };
  }, []);

  return null;
}
