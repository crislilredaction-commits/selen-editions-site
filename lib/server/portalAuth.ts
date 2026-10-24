const PORTAL_ROLE_BY_SLUG = {
  apprenant: "learner",
  formateur: "trainer",
  entreprise: "enterprise",
} as const;

export function normalizeEmail(value: string | null | undefined) {
  return value?.trim().toLowerCase() || "";
}

export function isApiRequest(pathname: string) {
  return pathname.startsWith("/api/daily-portal/");
}

export function portalContext(pathname: string) {
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
