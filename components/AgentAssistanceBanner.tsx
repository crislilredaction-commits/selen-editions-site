"use client";

import { useEffect, useState } from "react";

const TOKEN_KEY = "selen_agent_assistance_token";
const RETURN_KEY = "selen_agent_assistance_return_to";

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
      const returnTo = url.searchParams.get("assistanceReturnTo");
      if (returnTo) {
        try {
          const returnUrl = new URL(returnTo);
          if (returnUrl.protocol === "https:" || returnUrl.hostname === "localhost") {
            window.sessionStorage.setItem(RETURN_KEY, returnUrl.toString());
          }
        } catch {
          window.sessionStorage.removeItem(RETURN_KEY);
        }
      }
      window.setTimeout(() => setActive(true), 0);
      return;
    }

    window.setTimeout(() => setActive(Boolean(getStoredAssistanceToken())), 0);
  }, []);

  if (!active) return null;

  function exitAssistance() {
    const returnTo = window.sessionStorage.getItem(RETURN_KEY);
    window.sessionStorage.removeItem(TOKEN_KEY);
    window.sessionStorage.removeItem(RETURN_KEY);
    setActive(false);
    window.location.href = returnTo || "/client/login";
  }

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
      <strong>Mode assistance Studio</strong> — vous agissez pour cet organisme.
      Les actions réalisées sont enregistrées et attribuées à l’agent Studio.
      <button
        type="button"
        onClick={exitAssistance}
        style={{
          marginLeft: 14,
          border: "1px solid #d6a14a",
          borderRadius: 6,
          background: "transparent",
          color: "#f7ead6",
          padding: "6px 10px",
          cursor: "pointer",
          fontWeight: 700,
        }}
      >
        Retour à Studio
      </button>
    </div>
  );
}
