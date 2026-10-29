import { NextResponse } from "next/server";

import { validateDiscountCode } from "@/lib/server/discountCodes";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);

  const result = await validateDiscountCode({
    code: body?.code,
    clientEmail: body?.clientEmail,
    amountCents: body?.amountCents,
  });

  return NextResponse.json(result);
}
