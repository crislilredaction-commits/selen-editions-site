import { getAdminSupabase } from "@/lib/server/clientNdaAccess";

export type DiscountValidationResult =
  | {
      valid: true;
      discountCodeId: string;
      discountAmountCents: number;
      finalAmountCents: number;
      label: string;
      code: string;
    }
  | {
      valid: false;
      reason: string;
    };

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown) {
  return clean(value).toLowerCase();
}

function cents(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0;
}

function isExpired(value: unknown) {
  const expiresAt = clean(value);
  if (!expiresAt) return false;
  return new Date(expiresAt).getTime() < Date.now();
}

function computeDiscountAmount({
  amountCents,
  percentOff,
  amountOffCents,
}: {
  amountCents: number;
  percentOff: unknown;
  amountOffCents: unknown;
}) {
  const percent = Number(percentOff);
  const fixedAmount = cents(amountOffCents);

  if (Number.isFinite(percent) && percent > 0) {
    return Math.min(amountCents, Math.round((amountCents * percent) / 100));
  }

  if (fixedAmount > 0) {
    return Math.min(amountCents, fixedAmount);
  }

  return 0;
}

export async function validateDiscountCode({
  code,
  clientEmail,
  amountCents,
}: {
  code: unknown;
  clientEmail: unknown;
  amountCents: unknown;
}): Promise<DiscountValidationResult> {
  const cleanCode = clean(code);
  const cleanEmail = normalizeEmail(clientEmail);
  const baseAmountCents = cents(amountCents);

  if (!cleanCode) return { valid: false, reason: "Code obligatoire." };
  if (!cleanEmail) return { valid: false, reason: "Email client obligatoire." };

  const supabase = getAdminSupabase();
  const { data, error } = await supabase
    .from("discount_codes")
    .select(
      "id, code, client_email, status, used_at, expires_at, percent_off, amount_off_cents",
    )
    .ilike("code", cleanCode)
    .limit(1)
    .maybeSingle();

  if (error) return { valid: false, reason: error.message };
  if (!data) return { valid: false, reason: "Code introuvable." };
  if (data.status !== "active") return { valid: false, reason: "Code inactif." };
  if (data.used_at) return { valid: false, reason: "Code déjà utilisé." };
  if (isExpired(data.expires_at)) return { valid: false, reason: "Code expiré." };

  const codeEmail = normalizeEmail(data.client_email);
  if (codeEmail !== cleanEmail) {
    return { valid: false, reason: "Code réservé à une autre adresse email." };
  }

  const discountAmountCents = computeDiscountAmount({
    amountCents: baseAmountCents,
    percentOff: data.percent_off,
    amountOffCents: data.amount_off_cents,
  });

  if (discountAmountCents <= 0) {
    return { valid: false, reason: "Code sans réduction applicable." };
  }

  return {
    valid: true,
    discountCodeId: data.id,
    code: data.code,
    discountAmountCents,
    finalAmountCents: Math.max(0, baseAmountCents - discountAmountCents),
    label: data.code,
  };
}

export async function markDiscountCodeUsed({
  discountCodeId,
  clientEmail,
}: {
  discountCodeId: string;
  clientEmail: string;
}) {
  const supabase = getAdminSupabase();
  const { error } = await supabase
    .from("discount_codes")
    .update({
      status: "used",
      used_at: new Date().toISOString(),
      used_by_email: clientEmail.trim().toLowerCase(),
    })
    .eq("id", discountCodeId)
    .eq("status", "active")
    .is("used_at", null);

  if (error) {
    throw new Error(error.message);
  }
}
