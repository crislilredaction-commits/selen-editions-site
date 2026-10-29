import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import {
  isApiRequest,
  normalizeEmail,
  portalContext,
} from "@/lib/server/portalAuth";

function portalLoginRedirect(request: NextRequest, switchAccount = false) {
  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/client/login";
  loginUrl.search = "";
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set("next", nextPath);
  if (switchAccount) loginUrl.searchParams.set("switch", "1");
  return NextResponse.redirect(loginUrl);
}

function unauthorized(request: NextRequest) {
  if (isApiRequest(request.nextUrl.pathname)) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }
  return portalLoginRedirect(request);
}

function forbidden(request: NextRequest) {
  if (isApiRequest(request.nextUrl.pathname)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  return new NextResponse("Accès refusé. Ce portail n’est pas associé à votre compte.", {
    status: 403,
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return unauthorized(request);
  }

  const context = portalContext(request.nextUrl.pathname);
  if (!context.token || !context.roleIsValid) {
    return forbidden(request);
  }

  const admin = createSupabaseAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: access, error } = await admin
    .from("daily_portal_access_tokens")
    .select("portal_type,entity_email,status,expires_at")
    .eq("token", context.token)
    .maybeSingle();

  if (error || !access) {
    return forbidden(request);
  }

  if (access.status !== "pending" && access.status !== "viewed") {
    return forbidden(request);
  }

  if (access.expires_at) {
    const expiresAt = new Date(access.expires_at).getTime();
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      return forbidden(request);
    }
  }

  if (!normalizeEmail(user.email) || normalizeEmail(user.email) !== normalizeEmail(access.entity_email)) {
    if (!isApiRequest(request.nextUrl.pathname)) {
      return portalLoginRedirect(request, true);
    }
    return forbidden(request);
  }

  if (context.expectedPortalType && access.portal_type !== context.expectedPortalType) {
    return forbidden(request);
  }

  return response;
}

export const config = {
  matcher: ["/daily/portail/:path*", "/api/daily-portal/:path*"],
};