"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { getStoredAssistanceToken } from "@/components/AgentAssistanceBanner";
import LoadingMascot from "@/components/ui/LoadingMascot";

const ASSISTANCE_CHOOSER = "/client/daily/formateur/assistance";

export default function TrainerWorkspaceLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    const queryToken = currentUrl.searchParams.get("assistanceToken")?.trim() || "";
    const assisted = Boolean(queryToken || getStoredAssistanceToken());

    if (assisted && pathname !== ASSISTANCE_CHOOSER && pathname !== `${ASSISTANCE_CHOOSER}/session`) {
      const destination = new URL(ASSISTANCE_CHOOSER, window.location.origin);
      if (queryToken) destination.searchParams.set("assistanceToken", queryToken);
      const returnTo = currentUrl.searchParams.get("assistanceReturnTo")?.trim();
      if (returnTo) destination.searchParams.set("assistanceReturnTo", returnTo);
      router.replace(`${destination.pathname}${destination.search}`);
      return;
    }

    setReady(true);
  }, [pathname, router]);

  if (!ready) {
    return <LoadingMascot message="Sélion vérifie le contexte formateur…" />;
  }

  return children;
}
