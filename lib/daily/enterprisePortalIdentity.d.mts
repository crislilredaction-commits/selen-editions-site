export type EnterpriseCompany = Record<string, unknown>;
export function resolveEnterprisePortalCompany(
  companies: EnterpriseCompany[],
  entityEmail: string,
): { status: "ok" | "missing" | "ambiguous"; company: EnterpriseCompany | null };
export function matchesEnterprisePortalRecipient(recipientEmail: unknown, entityEmail: string): boolean;
