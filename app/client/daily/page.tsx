"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/app/lib/supabase/client";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";
import DailyDashboardOverviewV2 from "@/components/daily/DailyDashboardOverviewV2";
import RecentPublishedDocumentsCard from "@/components/daily/RecentPublishedDocumentsCard";
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

  return (
    <>
      <div className="mx-auto max-w-6xl px-4 pt-5 md:px-6">
        <Link
          href="/client/daily/formateur"
          className="inline-flex items-center gap-2 border border-[#b28a62]/45 bg-[#fffaf0]/70 px-4 py-3 font-['Cinzel'] text-[0.66rem] font-bold uppercase tracking-[0.1em] text-[#8a4b24] no-underline hover:bg-[#efe3cf]/70"
        >
          Mon espace formateur →
        </Link>
      </div>
      <RecentPublishedDocumentsCard />
      <DailyDashboardOverviewV2 />
    </>
  );
}
