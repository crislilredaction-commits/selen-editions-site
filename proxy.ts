import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

const PORTAL_ROLE_BY_SLUG = {
  apprenant: "learner",
  formateur: "trainer",
  entreprise: "enterprise",
} as const;

function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

function isApiRequest(pathname: string) {
  return pathname.startsWith("/api/daily-portal/");
}

function unauthorized(request: NextRequest) {
  if (isApiRequest(request.nextUrl.pathname)) {
    return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/client/login";
  loginUrl.search = "";
  const nextPath = `${request.nextUrl.pathname}${request.nextUrl.search}`;
  loginUrl.searchParams.set("next", nextPath);
  return NextResponse.redirect(loginUrl);
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

function portalContext(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);

  if (segments[0] === "daily" && segments[1] === "portail") {
    const roleSlug = segments[2] as keyof typeof PORTAL_ROLE_BY_SLUG | undefined;
    const token = segments[3];
    return {
      token,
      expectedPortalType: roleSlug ? PORTAL_ROLE_BY_SLUG[roleSlug] : undefined,
      roleIsValid: Boolean(roleSlug && PORTAL_ROLE_BY_SLUG[roleSlug]),
    };
  }

  if (segments[0] === "api" && segments[1] === "daily-portal") {
    return { token: segments[2], expectedPortalType: undefined, roleIsValid: true };
  }

  return { token: undefined, expectedPortalType: undefined, roleIsValid: false };
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
