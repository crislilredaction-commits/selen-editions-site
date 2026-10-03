export type ContractingPartyType = "individual" | "company";

export function isContractingPartyType(value: unknown): value is ContractingPartyType {
  return value === "individual" || value === "company";
}

// Only historical enrolments without a canonical choice retain the former SIRET rule.
export function resolveContractingPartyType(enrolment: { contracting_party_type?: unknown }, legacyClientSiret?: unknown): ContractingPartyType {
  if (isContractingPartyType(enrolment.contracting_party_type)) return enrolment.contracting_party_type;
  return String(legacyClientSiret ?? "").trim() ? "company" : "individual";
}

export function validateContractingParty(enrolment: { contracting_party_type?: unknown; company_name?: unknown }, required = true): string | null {
  if (!required && enrolment.contracting_party_type == null) return null;
  if (!isContractingPartyType(enrolment.contracting_party_type)) return "Choisissez une partie contractante : particulier ou entreprise.";
  if (enrolment.contracting_party_type === "company" && !(typeof enrolment.company_name === "string" && enrolment.company_name.trim())) return "Une entreprise commanditaire est requise pour cette inscription.";
  return null;
}
