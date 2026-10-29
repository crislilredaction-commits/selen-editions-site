const normalizedEmail = (value) => String(value ?? "").trim().toLowerCase();
const normalizedName = (value) => String(value ?? "").trim().toLowerCase();

/**
 * A bearer link must resolve to exactly one company in this session.
 * Company names are display labels, never safe identity keys.
 */
export function resolveEnterprisePortalCompany(companies, entityEmail) {
  const email = normalizedEmail(entityEmail);
  if (!email) return { status: "missing", company: null };
  const matches = companies.filter((company) => normalizedEmail(company.email) === email);
  if (!matches.length) return { status: "missing", company: null };
  if (matches.length !== 1) return { status: "ambiguous", company: null };
  const companyName = normalizedName(matches[0].name);
  if (!companyName) return { status: "missing", company: null };
  if (companies.filter((company) => normalizedName(company.name) === companyName).length !== 1) {
    return { status: "ambiguous", company: null };
  }
  return { status: "ok", company: matches[0] };
}

export function matchesEnterprisePortalRecipient(recipientEmail, entityEmail) {
  const email = normalizedEmail(entityEmail);
  return Boolean(email) && normalizedEmail(recipientEmail) === email;
}
