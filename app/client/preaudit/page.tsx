"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { checkPreauditAccess } from "../../lib/checkPreauditAccess";
import ClientSupportBar from "@/components/ClientSupportBar";

type ProfileQuestion = {
  question_key: string;
  question_order: number;
  question: string;
  help_text: string | null;
  response_type: "yes_no" | "text" | "date" | "choice" | "multi_choice";
  options: string[];
  is_required: boolean;
  impact_description: string | null;
  answer_value: unknown;
  answer_text: string | null;
};

type SessionData = {
  id: string;
  status: string;
  applicable_indicators: number[];
  excluded_indicators: number[];
  profile_data: Record<string, unknown>;
};

export default function PreauditProfilePage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);

  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [session, setSession] = useState<SessionData | null>(null);
  const [questions, setQuestions] = useState<ProfileQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});

  useEffect(() => {
    async function init() {
      setLoading(true);
      setError("");

      const { data: authData } = await supabase.auth.getUser();

      if (!authData.user) {
        router.push("/client/login");
        return;
      }

      const accessCheck = await checkPreauditAccess(supabase);

      if (!accessCheck.ok) {
        router.replace("/client");
        return;
      }

      let sessionId = localStorage.getItem("preaudit_session_id");

      if (!sessionId) {
        const { data: sessionRaw, error: sessionError } = await supabase.rpc(
          "start_or_resume_preaudit_session",
        );

        if (sessionError || !sessionRaw) {
          setError(
            `Impossible de démarrer le préaudit. ${sessionError?.message ?? ""}`,
          );
          setLoading(false);
          return;
        }

        const sessionRow = Array.isArray(sessionRaw)
          ? sessionRaw[0]
          : sessionRaw;
        sessionId = sessionRow?.session_id;

        if (!sessionId) {
          setError("Session préaudit introuvable.");
          setLoading(false);
          return;
        }

        localStorage.setItem("preaudit_session_id", sessionId);
      }

      const { data: pageRaw, error: pageError } = await supabase.rpc(
        "get_preaudit_profile_page",
        { p_session_id: sessionId },
      );

      if (pageError || !pageRaw) {
        setError(
          `Impossible de charger le questionnaire profil. ${pageError?.message ?? ""}`,
        );
        setLoading(false);
        return;
      }

      const page = Array.isArray(pageRaw) ? pageRaw[0] : pageRaw;

      setSession(page.session);
      if (page.session?.id) {
        localStorage.setItem("preaudit_session_id", page.session.id);
      }
      setQuestions(page.questions ?? []);

      const initialAnswers: Record<string, unknown> = {};

      (page.questions ?? []).forEach((q: ProfileQuestion) => {
        if (q.answer_value !== null && q.answer_value !== undefined) {
          initialAnswers[q.question_key] = q.answer_value;
        } else if (q.answer_text) {
          initialAnswers[q.question_key] = q.answer_text;
        } else if (q.response_type === "multi_choice") {
          initialAnswers[q.question_key] = [];
        } else {
          initialAnswers[q.question_key] = "";
        }
      });

      setAnswers(initialAnswers);
      setLoading(false);
    }

    init();
  }, [router, supabase]);

  async function saveAnswer(question: ProfileQuestion, value: unknown) {
    if (!session) return;

    setSavingKey(question.question_key);
    setError("");

    setAnswers((prev) => ({
      ...prev,
      [question.question_key]: value,
    }));

    const isTextType =
      question.response_type === "text" || question.response_type === "date";

    const { data, error: saveError } = await supabase.rpc(
      "save_preaudit_profile_answer",
      {
        p_session_id: session.id,
        p_question_key: question.question_key,
        p_answer_value: isTextType ? null : value,
        p_answer_text: isTextType ? String(value ?? "") : null,
      },
    );

    if (saveError) {
      setError(saveError.message);
      setSavingKey(null);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;

    setSession((prev) =>
      prev
        ? {
            ...prev,
            applicable_indicators:
              row?.applicable_indicators ?? prev.applicable_indicators,
            excluded_indicators:
              row?.excluded_indicators ?? prev.excluded_indicators,
            profile_data: row?.profile_data ?? prev.profile_data,
          }
        : prev,
    );

    setSavingKey(null);
  }

  async function saveProfileAndGo() {
    if (!session) {
      setError("Session préaudit introuvable.");
      return;
    }

    const missingRequired = questions.filter((question) => {
      if (!question.is_required) return false;

      const value = answers[question.question_key];

      if (Array.isArray(value)) return value.length === 0;

      return value === "" || value === null || value === undefined;
    });

    if (missingRequired.length > 0) {
      setError(
        `Veuillez répondre aux questions obligatoires avant de continuer (${missingRequired.length} manquante${
          missingRequired.length > 1 ? "s" : ""
        }).`,
      );
      return;
    }

    setSavingKey("all");
    setError("");

    const cleanProfileData: Record<string, unknown> = {};

    questions.forEach((question) => {
      const value = answers[question.question_key];

      if (value !== undefined && value !== null) {
        cleanProfileData[question.question_key] = value;
      } else if (question.response_type === "multi_choice") {
        cleanProfileData[question.question_key] = [];
      } else {
        cleanProfileData[question.question_key] = "";
      }
    });

    const { data, error: bulkError } = await supabase.rpc(
      "save_preaudit_profile_bulk",
      {
        p_session_id: session.id,
        p_profile_data: cleanProfileData,
      },
    );

    if (bulkError) {
      console.error("ERREUR BULK PROFIL :", bulkError);
      setError(`Erreur sauvegarde profil : ${bulkError.message}`);
      setSavingKey(null);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;

    if (!row) {
      setError(
        "Le profil a été envoyé, mais Supabase n’a retourné aucune session.",
      );
      setSavingKey(null);
      return;
    }

    const applicableIndicators = row.applicable_indicators ?? [];
    const excludedIndicators = row.excluded_indicators ?? [];

    const updatedSession: SessionData = {
      ...session,
      applicable_indicators: applicableIndicators,
      excluded_indicators: excludedIndicators,
      profile_data: row.profile_data ?? cleanProfileData,
    };

    setSession(updatedSession);

    localStorage.setItem("preaudit_session_id", session.id);
    localStorage.setItem("preaudit_profile_updated_at", String(Date.now()));

    setSavingKey(null);

    router.push("/client/preaudit/marques");
  }
  function toggleMultiChoice(question: ProfileQuestion, option: string) {
    const current = Array.isArray(answers[question.question_key])
      ? (answers[question.question_key] as string[])
      : [];

    const next = current.includes(option)
      ? current.filter((item) => item !== option)
      : [...current, option];

    saveAnswer(question, next);
  }

  const answeredCount = questions.filter((q) => {
    const value = answers[q.question_key];

    if (Array.isArray(value)) return value.length > 0;
    return value !== "" && value !== null && value !== undefined;
  }).length;

  const progress =
    questions.length > 0
      ? Math.round((answeredCount / questions.length) * 100)
      : 0;

  if (loading) {
    return (
      <main
        className="gazette-paper"
        style={{ minHeight: "100vh", padding: "3rem 1.5rem" }}
      >
        <p style={{ textAlign: "center", color: "var(--ink-faint)" }}>
          Chargement du grimoire de profil…
        </p>
      </main>
    );
  }

  return (
    <main className="gazette-paper" style={{ minHeight: "100vh" }}>
      <ClientSupportBar context="l’auto-audit Qualiopi" />
      <div
        style={{
          maxWidth: "900px",
          margin: "0 auto",
          padding: "2rem 1.5rem 4rem",
        }}
      >
        <header
          className="gazette-cta"
          style={{ padding: "2rem", marginBottom: "1.5rem" }}
        >
          <div style={{ position: "relative", zIndex: 1 }}>
            <div
              className="gazette-label"
              style={{
                borderColor: "rgba(178,138,98,0.5)",
                background: "rgba(178,138,98,0.1)",
                color: "var(--sepia-mid)",
                marginBottom: "0.75rem",
              }}
            >
              Préaudit Qualiopi
            </div>

            <h1
              className="gazette-hero-title"
              style={{
                fontSize: "clamp(1.5rem, 4vw, 2.3rem)",
                color: "var(--parchment)",
                marginBottom: "0.5rem",
              }}
            >
              Analyse de votre profil
            </h1>

            <p style={{ color: "var(--sepia-mid)", lineHeight: 1.6 }}>
              Avant d’ouvrir les indicateurs, Selen vérifie ceux qui concernent
              réellement votre activité.
            </p>

            <div style={{ marginTop: "1.25rem" }}>
              <div
                style={{
                  height: "6px",
                  width: "100%",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(178,138,98,0.2)",
                }}
              >
                <div
                  style={{
                    height: "100%",
                    width: `${progress}%`,
                    background:
                      "linear-gradient(90deg, var(--ocre-dark), var(--ocre-gold))",
                    transition: "width 0.4s ease",
                  }}
                />
              </div>

              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginTop: "0.4rem",
                  fontFamily: "var(--font-cinzel, 'Cinzel', serif)",
                  fontSize: "0.58rem",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: "rgba(200,168,122,0.6)",
                }}
              >
                <span>
                  {answeredCount} / {questions.length} réponses
                </span>
                <span>{progress} %</span>
              </div>
            </div>
          </div>
        </header>

        {error && (
          <div
            style={{
              border: "1px solid var(--rust)",
              borderLeft: "4px solid var(--rust)",
              padding: "1rem",
              marginBottom: "1rem",
              color: "var(--rust)",
              background: "rgba(138,75,36,0.05)",
            }}
          >
            {error}
          </div>
        )}

        <section style={{ display: "grid", gap: "0.8rem" }}>
          {questions.map((q) => {
            const value = answers[q.question_key];

            return (
              <article
                key={q.question_key}
                style={{
                  background: "var(--paper)",
                  border: "1px solid var(--sepia-mid)",
                  padding: "1rem",
                  position: "relative",
                }}
              >
                <p
                  style={{
                    fontFamily: "var(--font-cinzel, 'Cinzel', serif)",
                    fontSize: "0.58rem",
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "var(--ocre-dark)",
                    marginBottom: "0.35rem",
                  }}
                >
                  Question {q.question_order}
                </p>

                <h2
                  style={{
                    fontSize: "1rem",
                    color: "var(--ink)",
                    marginBottom: "0.4rem",
                  }}
                >
                  {q.question}
                </h2>

                {q.help_text && (
                  <p
                    style={{
                      fontSize: "0.85rem",
                      color: "var(--ink-faint)",
                      fontStyle: "italic",
                      lineHeight: 1.5,
                      marginBottom: "0.75rem",
                    }}
                  >
                    {q.help_text}
                  </p>
                )}

                {q.response_type === "yes_no" && (
                  <div
                    style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
                  >
                    {[
                      { label: "Oui", value: "yes" },
                      { label: "Non", value: "no" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => saveAnswer(q, option.value)}
                        disabled={savingKey === q.question_key}
                        style={{
                          padding: "0.45rem 0.9rem",
                          border: "1px solid var(--sepia-mid)",
                          background:
                            value === option.value
                              ? "var(--ocre-gold)"
                              : "transparent",
                          color:
                            value === option.value
                              ? "#1a1410"
                              : "var(--ink-soft)",
                          cursor: "pointer",
                        }}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                )}

                {q.response_type === "choice" && (
                  <select
                    value={String(value ?? "")}
                    onChange={(e) => saveAnswer(q, e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.6rem",
                      border: "1px solid var(--sepia-mid)",
                      background: "rgba(255,255,255,0.45)",
                    }}
                  >
                    <option value="">Sélectionner</option>
                    {(q.options ?? []).map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                )}

                {q.response_type === "multi_choice" && (
                  <div
                    style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}
                  >
                    {(q.options ?? []).map((option) => {
                      const selected =
                        Array.isArray(value) && value.includes(option);

                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => toggleMultiChoice(q, option)}
                          disabled={savingKey === q.question_key}
                          style={{
                            padding: "0.45rem 0.9rem",
                            border: "1px solid var(--sepia-mid)",
                            background: selected
                              ? "var(--ocre-gold)"
                              : "transparent",
                            color: selected ? "#1a1410" : "var(--ink-soft)",
                            cursor:
                              savingKey === q.question_key
                                ? "not-allowed"
                                : "pointer",
                            opacity: savingKey === q.question_key ? 0.6 : 1,
                          }}
                        >
                          {option}
                        </button>
                      );
                    })}
                  </div>
                )}

                {(q.response_type === "text" || q.response_type === "date") && (
                  <input
                    type={q.response_type === "date" ? "date" : "text"}
                    value={String(value ?? "")}
                    onChange={(e) =>
                      setAnswers((prev) => ({
                        ...prev,
                        [q.question_key]: e.target.value,
                      }))
                    }
                    onBlur={(e) => saveAnswer(q, e.target.value)}
                    style={{
                      width: "100%",
                      padding: "0.6rem",
                      border: "1px solid var(--sepia-mid)",
                      background: "rgba(255,255,255,0.45)",
                    }}
                  />
                )}

                {q.impact_description &&
                  value !== "" &&
                  value !== null &&
                  value !== undefined &&
                  !(Array.isArray(value) && value.length === 0) && (
                    <p
                      style={{
                        marginTop: "0.7rem",
                        fontSize: "0.78rem",
                        color: "var(--ink-faint)",
                        borderTop: "1px solid var(--sepia-mid)",
                        paddingTop: "0.5rem",
                      }}
                    >
                      ✦ {q.impact_description}
                    </p>
                  )}
              </article>
            );
          })}
        </section>

        <div
          style={{
            marginTop: "2rem",
            display: "flex",
            justifyContent: "space-between",
            gap: "1rem",
            flexWrap: "wrap",
          }}
        >
          <button
            type="button"
            onClick={() => router.push("/client")}
            className="btn-ink"
          >
            <span>← Retour espace client</span>
          </button>

          <button
            type="button"
            onClick={saveProfileAndGo}
            className="btn-ink"
            disabled={savingKey === "all" || !session}
            style={{
              opacity: savingKey === "all" || !session ? 0.45 : 1,
              cursor:
                savingKey === "all" || !session ? "not-allowed" : "pointer",
            }}
          >
            <span>
              {savingKey === "all"
                ? "Sauvegarde du profil…"
                : "Continuer vers la vérification des marques →"}
            </span>
          </button>
        </div>

        {session && (
          <div
            style={{
              marginTop: "1.5rem",
              padding: "1rem",
              border: "1px dashed var(--sepia-mid)",
              color: "var(--ink-faint)",
              fontSize: "0.85rem",
            }}
          >
            <strong>Indicateurs applicables :</strong>{" "}
            {session.applicable_indicators?.length
              ? session.applicable_indicators.join(", ")
              : "à déterminer après le questionnaire"}
          </div>
        )}
      </div>
    </main>
  );
}
