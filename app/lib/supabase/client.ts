"use client";

import { createBrowserClient } from "@supabase/ssr";

type SupabaseBrowserClientOptions = {
  detectSessionInUrl?: boolean;
  isSingleton?: boolean;
};

export function createSupabaseBrowserClient(
  options: SupabaseBrowserClientOptions = {},
) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL manquant dans .env.local");
  }

  if (!supabaseAnonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_ANON_KEY manquant dans .env.local");
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey, {
    ...(typeof options.isSingleton === "boolean"
      ? { isSingleton: options.isSingleton }
      : {}),
    auth: {
      ...(typeof options.detectSessionInUrl === "boolean"
        ? { detectSessionInUrl: options.detectSessionInUrl }
        : {}),
    },
  });
}
