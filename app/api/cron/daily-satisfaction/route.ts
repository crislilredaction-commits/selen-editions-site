import { NextResponse } from "next/server";
import { GET as runLearnerSatisfactionAutomation } from "@/app/api/internal/daily/satisfaction-automation/route";
import { GET as runStakeholderSatisfactionAutomation } from "@/app/api/internal/daily/stakeholder-satisfaction-automation/route";

const LEARNER_AUTOMATION_PATH = "/api/internal/daily/satisfaction-automation";
const STAKEHOLDER_AUTOMATION_PATH = "/api/internal/daily/stakeholder-satisfaction-automation";

function cronSecret() {
  return process.env.CRON_SECRET?.trim() ?? "";
}

function isAuthorized(request: Request, secret: string) {
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function runWithAutomationSecret(
  request: Request,
  path: string,
  handler: (request: Request) => Promise<Response>,
  secret: string,
) {
  const previous = process.env.DAILY_AUTOMATION_SECRET;
  process.env.DAILY_AUTOMATION_SECRET = secret;
  try {
    const url = new URL(request.url);
    url.pathname = path;
    url.search = "?execute=1";
    return await handler(new Request(url, {
      method: "GET",
      headers: { authorization: `Bearer ${secret}` },
    }));
  } finally {
    if (previous === undefined) delete process.env.DAILY_AUTOMATION_SECRET;
    else process.env.DAILY_AUTOMATION_SECRET = previous;
  }
}

async function responsePayload(response: Response) {
  return response.json().catch(() => ({ error: `Réponse automation illisible (${response.status}).` }));
}

export async function GET(request: Request) {
  const secret = cronSecret();
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET manquant." }, { status: 503 });
  }
  if (!isAuthorized(request, secret)) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 401 });
  }

  const learnerResponse = await runWithAutomationSecret(
    request,
    LEARNER_AUTOMATION_PATH,
    runLearnerSatisfactionAutomation,
    secret,
  );
  const stakeholderResponse = await runWithAutomationSecret(
    request,
    STAKEHOLDER_AUTOMATION_PATH,
    runStakeholderSatisfactionAutomation,
    secret,
  );

  const [learners, stakeholders] = await Promise.all([
    responsePayload(learnerResponse),
    responsePayload(stakeholderResponse),
  ]);
  const ok = learnerResponse.ok && stakeholderResponse.ok;

  return NextResponse.json({
    ok,
    executed: true,
    learners,
    stakeholders,
  }, { status: ok ? 200 : 207 });
}
