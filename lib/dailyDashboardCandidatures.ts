export type DashboardCandidature = {
  id: string; applicant_label: string; formation_title: string;
  decision_status: string; can_decide: boolean; attached_session_id?: string | null; read_only?: boolean; materialized_at?: string | null; can_materialize?: boolean;
};
type Action = { id: string; priority: "high" | "medium" | "normal"; title: string; detail: string; href: string; sessionId?: string | null; sessionLabel?: string | null };

export async function loadDashboardCandidatures(fetcher: (input: string, init?: RequestInit) => Promise<Response>) {
  try {
    const response = await fetcher("/api/client/daily/registration-requests", { cache: "no-store" });
    if (response.status === 403) return { requests: [] as DashboardCandidature[], error: "", forbidden: true };
    const body = await response.json();
    if (!response.ok || !Array.isArray(body.requests)) throw new Error(body.error || "Les candidatures ne peuvent pas être chargées.");
    return { requests: body.requests as DashboardCandidature[], error: "", forbidden: false };
  } catch (cause) {
    return { requests: [] as DashboardCandidature[], error: cause instanceof Error ? cause.message : "Les candidatures ne peuvent pas être chargées.", forbidden: false };
  }
}

export function mergeDashboardCandidatureActions(actions: Action[], requests: DashboardCandidature[]): Action[] {
  const pending = requests.filter(request => request.decision_status === "ready_for_of" && (request.can_decide || request.read_only));
  const ids = new Set(requests.map(request => `registration-request:${request.id}`));
  const merged = actions.filter(action => !ids.has(action.id));
  for (const request of pending) merged.push({
    id: `registration-request:${request.id}`, priority: "high",
    title: `Candidature à décider : ${request.applicant_label}`,
    detail: `${request.formation_title} · Analyse Selen terminée. Acceptez ou refusez la candidature.`,
    href: `/client/daily/candidatures?request=${encodeURIComponent(request.id)}`,
    sessionId: request.attached_session_id ?? null, sessionLabel: request.formation_title,
  });
  for (const request of requests.filter(request => request.decision_status === "accepted" && !request.materialized_at && request.can_materialize)) merged.push({
    id: `registration-request:${request.id}`, priority: "high", title: `Inscription à finaliser : ${request.applicant_label}`,
    detail: `${request.formation_title} · La candidature est acceptée. Choisissez la session pour terminer l’inscription.`,
    href: `/client/daily/candidatures?request=${encodeURIComponent(request.id)}`, sessionId: request.attached_session_id ?? null, sessionLabel: request.formation_title,
  });
  return merged;
}
