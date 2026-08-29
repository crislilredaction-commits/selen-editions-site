import { NextResponse } from "next/server";

const TOKEN_RE = /^[a-zA-Z0-9]{16,64}$/;

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "QR code introuvable." }, { status: 404 });

  const origin = new URL(req.url).origin;
  const publicUrl = `${origin}/i/${encodeURIComponent(token)}`;
  const qrService = `https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=16&format=png&data=${encodeURIComponent(publicUrl)}`;
  const response = await fetch(qrService, { cache: "force-cache" });
  if (!response.ok) return NextResponse.json({ error: "Génération du QR code indisponible." }, { status: 502 });

  const bytes = await response.arrayBuffer();
  return new NextResponse(bytes, {
    status: 200,
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `inline; filename="selen-inscription-${token.slice(0, 8)}.png"`,
      "Cache-Control": "public, max-age=86400, s-maxage=86400",
    },
  });
}
