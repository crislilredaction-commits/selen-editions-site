export function normalizeBeneficiarySiret(value: unknown) {
  return String(value ?? "").replace(/\s+/g, "").trim();
}

export function validateBeneficiarySiret(value: unknown) {
  const normalized = normalizeBeneficiarySiret(value);
  if (!normalized) return { valid: true as const, value: null };
  if (!/^\d{14}$/.test(normalized)) {
    return {
      valid: false as const,
      value: normalized,
      error: "Le SIRET doit comporter exactement 14 chiffres.",
    };
  }
  return { valid: true as const, value: normalized };
}
