"use client";

import { useEffect, useState } from "react";

const TOKEN_KEY = "selen_agent_assistance_token";

export function getStoredAssistanceToken() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(TOKEN_KEY) || "";
}

export function withAssistanceToken(path: string) {
  const token = getStoredAssistanceToken();
  if (!token) return path;
  const url = new URL(path, window.location.origin);
  url.searchParams.set("assistanceToken", token);
  return `${url.pathname}${url.search}`;
}

export function assistanceFetch(input: string, init: RequestInit = {}) {
  const token = getStoredAssistanceToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("x-selen-agent-assistance", token);

  return fetch(input, {
    ...init,
    headers,
  });
}

export default function AgentAssistanceBanner() {
  const [active, setActive] = useState(() => Boolean(getStoredAssistanceToken()));

  useEffect(() => {
    const url = new URL(window.location.href);
    const token = url.searchParams.get("assistanceToken");

    if (token) {
      window.sessionStorage.setItem(TOKEN_KEY, token);
      window.setTimeout(() => setActive(true), 0);
      return;
    }

    window.setTimeout(() => setActive(Boolean(getStoredAssistanceToken())), 0);
  }, []);

  if (!active) return null;

  return (
    <div
      style={{
        position: "sticky",
        top: 0,
        zIndex: 1000,
        background: "#2f2117",
        color: "#f7ead6",
        borderBottom: "2px solid #d6a14a",
        padding: "10px 18px",
        fontSize: 14,
        lineHeight: 1.45,
        textAlign: "center",
      }}
    >
      <strong>Mode assistance agent</strong> — certaines actions sont réservées
      au client. Les actions d’assistance sont enregistrées.
    </div>
  );
}
