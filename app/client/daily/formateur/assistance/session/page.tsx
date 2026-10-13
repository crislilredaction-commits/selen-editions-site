"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { assistanceFetch } from "@/components/AgentAssistanceBanner";
import AssistedTrainerAttendance, { type AssistedTrainerAttendanceData } from "@/components/daily/AssistedTrainerAttendance";
import LoadingMascot from "@/components/ui/LoadingMascot";
function SessionView() {
  const params = useSearchParams();
  const trainerId = params.get("trainer_id") ?? "", sessionId = params.get("session_id") ?? "";
  const [data, setData] = useState<AssistedTrainerAttendanceData | null>(null), [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false; setData(null); setError("");
    void assistanceFetch(`/api/client/daily/assisted-trainer-workspace?trainer_id=${encodeURIComponent(trainerId)}&session_id=${encodeURIComponent(sessionId)}`, {cache:"no-store"})
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body.error || "Session indisponible."); if (!cancelled) setData(body); })
      .catch(cause => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Session indisponible."); });
    return () => { cancelled = true; };
  }, [trainerId, sessionId]);
  return <main className="mx-auto max-w-5xl px-4 py-8"><Link href="/client/daily/formateur/assistance">← Choisir un autre espace formateur</Link>{error ? <p role="alert">{error}</p> : data ? <AssistedTrainerAttendance data={data} /> : <LoadingMascot message="Sélion rassemble le suivi de cette session…" />}</main>;
}
export default function Page() { return <Suspense fallback={<LoadingMascot message="Sélion prépare la session…" />}><SessionView /></Suspense>; }
