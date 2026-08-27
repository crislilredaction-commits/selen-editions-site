"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";
import DailyDashboardOverviewV2 from "@/components/daily/DailyDashboardOverviewV2";
import LoadingMascot from "@/components/ui/LoadingMascot";

export default function ClientDailyPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function boot() {
      try {
        const { data, error: authError } = await supabase.auth.getUser();
        if (authError || !data.user) {
          router.replace("/client/login");
          return;
        }

        const onboardingRes = await assistanceFetch("/api/client/daily/onboarding", { cache: "no-store" });
        const onboardingData = await onboardingRes.json().catch(() => null);

        if (!onboardingRes.ok) {
          if (!cancelled) {
            setError(onboardingData?.error ?? "Impossible d'ouvrir Selen Daily pour le moment.");
            setLoading(false);
          }
          return;
        }

        if (onboardingData?.onboarding?.status !== "completed") {
          router.replace("/client/daily/onboarding");
          return;
        }

        if (!cancelled) setLoading(false);
      } catch (cause) {
        if (!cancelled) {
          setError(cause instanceof Error ? cause.message : "Impossible d'ouvrir Selen Daily pour le moment.");
          setLoading(false);
        }
      }
    }

    void boot();
    return () => { cancelled = true; };
  }, [router, supabase]);

  if (loading) {
    return <LoadingMascot message="Sélion ouvre votre tableau de bord Daily…" />;
  }

  if (error) {
    return (
      <main style={{ maxWidth: 760, margin: "0 auto", padding: "3rem 1.25rem" }}>
        <div style={{ border: "1px solid var(--rust)", background: "rgba(138,75,36,.06)", padding: "1rem", color: "var(--rust)" }}>{error}</div>
      </main>
    );
  }

  return <DailyDashboardOverviewV2 />;
}
