import { NextResponse } from "next/server";

import { createSupportTicket } from "@/lib/server/supportTickets";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => null);
    const result = await createSupportTicket(body ?? {});

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({
      ok: true,
      ticketId: result.ticketId,
      acknowledgementSent: result.acknowledgementSent,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur inconnue." },
      { status: 500 },
    );
  }
}
