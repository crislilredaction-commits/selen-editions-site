import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function authorized(request: Request) {
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (!cronSecret) {
    return { ok: false as const, status: 503, error: "CRON_SECRET manquant." };
  }

  const received = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${cronSecret}`;
  if (!safeEqual(received, expected)) {
    return { ok: false as const, status: 401, error: "Accès refusé." };
  }

  return { ok: true as const };
}

export async function GET(request: Request) {
  const access = authorized(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const automationSecret = process.env.DAILY_AUTOMATION_SECRET?.trim();
  if (!automationSecret) {
    return NextResponse.json(
      {
        ok: false,
        status: "configuration_missing",
        job: "attendance",
      },
      { status: 503 },
    );
  }

  try {
    const response = await fetch(
      new URL("/api/internal/daily/attendance-automation?execute=1", request.url),
      {
        method: "GET",
        headers: {
          authorization: `Bearer ${automationSecret}`,
        },
        cache: "no-store",
      },
    );

    return NextResponse.json(
      {
        ok: response.ok,
        job: "attendance",
        status: response.ok ? "ok" : "failed",
        httpStatus: response.status,
      },
      { status: response.ok ? 200 : 502 },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        job: "attendance",
        status: "failed",
      },
      { status: 502 },
    );
  }
}
