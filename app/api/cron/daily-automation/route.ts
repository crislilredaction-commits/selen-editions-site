import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const JOBS = [
  {
    name: "learner_satisfaction",
    path: "/api/internal/daily/satisfaction-automation?execute=1",
    method: "GET",
    secretEnv: "DAILY_AUTOMATION_SECRET",
  },
  {
    name: "stakeholder_satisfaction",
    path: "/api/internal/daily/stakeholder-satisfaction-automation?execute=1",
    method: "GET",
    secretEnv: "DAILY_AUTOMATION_SECRET",
  },
  {
    name: "external_assessment_reminders",
    path: "/api/internal/daily/assessment-reminder-automation?execute=1",
    method: "GET",
    secretEnv: "DAILY_AUTOMATION_SECRET",
  },
  {
    name: "trainer_annual_reminders",
    path: "/api/internal/daily/trainer-annual-reminders",
    method: "POST",
    secretEnv: "DAILY_INTERNAL_REMINDER_SECRET",
  },
] as const;

type JobResult = {
  name: (typeof JOBS)[number]["name"];
  status: "ok" | "failed" | "configuration_missing";
  httpStatus?: number;
};

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

async function runJob(request: Request, job: (typeof JOBS)[number]): Promise<JobResult> {
  const jobSecret = process.env[job.secretEnv]?.trim();
  if (!jobSecret) {
    return { name: job.name, status: "configuration_missing" };
  }

  try {
    const response = await fetch(new URL(job.path, request.url), {
      method: job.method,
      headers: {
        authorization: `Bearer ${jobSecret}`,
        "content-type": "application/json",
      },
      cache: "no-store",
    });

    return {
      name: job.name,
      status: response.ok ? "ok" : "failed",
      httpStatus: response.status,
    };
  } catch {
    return { name: job.name, status: "failed" };
  }
}

export async function GET(request: Request) {
  const access = authorized(request);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const results: JobResult[] = [];

  for (const job of JOBS) {
    results.push(await runJob(request, job));
  }

  const failed = results.filter((result) => result.status === "failed").length;
  const configurationMissing = results.filter(
    (result) => result.status === "configuration_missing",
  ).length;

  return NextResponse.json(
    {
      ok: failed === 0 && configurationMissing === 0,
      jobs: results,
      failed,
      configuration_missing: configurationMissing,
    },
    { status: failed > 0 ? 500 : configurationMissing > 0 ? 503 : 200 },
  );
}
