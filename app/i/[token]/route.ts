import { NextResponse } from "next/server";

const TOKEN_RE = /^[a-zA-Z0-9]{16,64}$/;

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "Lien d'inscription invalide." }, { status: 404 });
  return NextResponse.redirect(new URL(`/daily-inscription/${encodeURIComponent(token)}`, req.url), 307);
}
