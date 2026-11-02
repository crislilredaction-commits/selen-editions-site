import assert from "node:assert/strict";
import test from "node:test";

// Read-only integration probe. It is deliberately skipped in ordinary CI.
// Never use a production URL, customer account, service-role key or real email.
const PREVIEW_SUFFIX = "-crislilredaction-4256s-projects.vercel.app";
const ORG_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function checkSandbox(env) {
  const errors = [];
  const preview = (name, prefix) => {
    try {
      const url = new URL(env[name] || "");
      if (url.protocol !== "https:" || !url.hostname.startsWith(prefix) ||
          !url.hostname.endsWith(PREVIEW_SUFFIX) ||
          url.username || url.password || url.search || url.hash || url.pathname !== "/") {
        errors.push(name + " must be a dedicated HTTPS Vercel Preview hostname");
      }
      return url;
    } catch {
      errors.push(name + " is missing or invalid");
      return null;
    }
  };
  const studio = preview("SELEN_SANDBOX_STUDIO_URL", "selen-studio-");
  preview("SELEN_SANDBOX_DAILY_URL", "selen-editions-site-");

  const sandboxRef = env.SELEN_SANDBOX_SUPABASE_REF || "";
  const productionRefs = (env.SELEN_PRODUCTION_SUPABASE_REFS || "")
    .split(",").map((ref) => ref.trim()).filter(Boolean);
  if (!/^[a-z0-9]{20}$/.test(sandboxRef) || productionRefs.length === 0 ||
      productionRefs.includes(sandboxRef) ||
      env.SELEN_SANDBOX_SUPABASE_URL !== `https://${sandboxRef}.supabase.co`) {
    errors.push("Sandbox Supabase must be a distinct explicitly identified project");
  }
  if (env.NEXT_PUBLIC_SUPABASE_URL === env.SELEN_SANDBOX_SUPABASE_URL &&
      env.NEXT_PUBLIC_SUPABASE_URL) {
    errors.push("Sandbox Supabase URL must not match the app's current database URL");
  }
  if (env.SELEN_SANDBOX_MAIL_MODE !== "collect-only" ||
      env.SELEN_SANDBOX_OUTBOUND !== "disabled" ||
      env.SELEN_SANDBOX_CRONS !== "disabled" ||
      env.SELEN_SANDBOX_WEBHOOKS !== "disabled") {
    errors.push("Mail must be capture-only; outbound, crons and webhooks disabled");
  }
  for (const suffix of ["A", "B"]) {
    if (!ORG_ID.test(env[`SELEN_SANDBOX_OF_${suffix}_ID`] || "")) {
      errors.push(`OF ${suffix} must have a fictional UUID fixture`);
    }
    if (!new RegExp(`^SELEN-FICTIF-OF-${suffix}-[A-Za-z0-9-]+$`).test(
      env[`SELEN_SANDBOX_OF_${suffix}_MARKER`] || "")) {
      errors.push(`OF ${suffix} must have an explicit fictional display marker`);
    }
    if (!(env[`SELEN_SANDBOX_AGENT_${suffix}_COOKIE`] || "").includes("=")) {
      errors.push(`OF ${suffix} requires its own sandbox agent session cookie`);
    }
  }
  if (env.SELEN_SANDBOX_OF_A_ID === env.SELEN_SANDBOX_OF_B_ID ||
      env.SELEN_SANDBOX_OF_A_MARKER === env.SELEN_SANDBOX_OF_B_MARKER ||
      env.SELEN_SANDBOX_AGENT_A_COOKIE === env.SELEN_SANDBOX_AGENT_B_COOKIE) {
    errors.push("A/B fixture IDs, markers and authenticated sessions must be distinct");
  }
  return { errors, studio };
}

function fictionalConfig() {
  return {
    SELEN_SANDBOX_STUDIO_URL: "https://selen-studio-fictif-crislilredaction-4256s-projects.vercel.app",
    SELEN_SANDBOX_DAILY_URL: "https://selen-editions-site-fictif-crislilredaction-4256s-projects.vercel.app",
    SELEN_SANDBOX_SUPABASE_REF: "aaaaaaaaaaaaaaaaaaaa",
    SELEN_SANDBOX_SUPABASE_URL: "https://aaaaaaaaaaaaaaaaaaaa.supabase.co",
    SELEN_PRODUCTION_SUPABASE_REFS: "bbbbbbbbbbbbbbbbbbbb",
    SELEN_SANDBOX_MAIL_MODE: "collect-only",
    SELEN_SANDBOX_OUTBOUND: "disabled",
    SELEN_SANDBOX_CRONS: "disabled",
    SELEN_SANDBOX_WEBHOOKS: "disabled",
    SELEN_SANDBOX_OF_A_ID: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    SELEN_SANDBOX_OF_B_ID: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    SELEN_SANDBOX_OF_A_MARKER: "SELEN-FICTIF-OF-A-001",
    SELEN_SANDBOX_OF_B_MARKER: "SELEN-FICTIF-OF-B-001",
    SELEN_SANDBOX_AGENT_A_COOKIE: "sb-session=fictif-A",
    SELEN_SANDBOX_AGENT_B_COOKIE: "sb-session=fictif-B",
  };
}

test("P0 sandbox: safe isolated A/B configuration is accepted", () => {
  assert.deepEqual(checkSandbox(fictionalConfig()).errors, []);
});

test("P0 sandbox: production reuse, external sends and shared identity fail closed", () => {
  const config = fictionalConfig();
  config.SELEN_PRODUCTION_SUPABASE_REFS = config.SELEN_SANDBOX_SUPABASE_REF;
  config.SELEN_SANDBOX_OUTBOUND = "enabled";
  config.SELEN_SANDBOX_AGENT_B_COOKIE = config.SELEN_SANDBOX_AGENT_A_COOKIE;
  config.SELEN_SANDBOX_STUDIO_URL = "https://selen-studio.vercel.app";
  assert.ok(checkSandbox(config).errors.length >= 4);
});

test("P0 sandbox: missing credentials and fixtures cannot trigger HTTP calls", () => {
  assert.ok(checkSandbox({}).errors.length >= 8);
});

test("P0-10 sandbox: authenticated Studio Qualiopi and certification pages isolate OF A/B",
  { skip: process.env.SELEN_SANDBOX_READONLY_PROBE !== "1"
    ? "No dedicated authenticated sandbox; zero HTTP calls in ordinary CI" : false },
  async () => {
    const env = process.env;
    const { errors, studio } = checkSandbox(env);
    assert.deepEqual(errors, [], "Sandbox preflight failed; no network request made");
    const paths = ["qualiopi-cycle", "trainer-certification-proofs"];
    const cases = [
      ["A", "B"], ["B", "A"],
    ];
    for (const path of paths) {
      for (const [self, other] of cases) {
        const cookie = env[`SELEN_SANDBOX_AGENT_${self}_COOKIE`];
        const ownId = env[`SELEN_SANDBOX_OF_${self}_ID`];
        const otherId = env[`SELEN_SANDBOX_OF_${other}_ID`];
        const ownMarker = env[`SELEN_SANDBOX_OF_${self}_MARKER`];
        const otherMarker = env[`SELEN_SANDBOX_OF_${other}_MARKER`];
        const request = async (id) => {
          const url = new URL(`/agent/daily/organisations/${id}/${path}`, studio);
          const response = await fetch(url, {
            method: "GET", redirect: "manual", headers: { Cookie: cookie },
            signal: AbortSignal.timeout(15000),
          });
          return { status: response.status, body: await response.text() };
        };
        const own = await request(ownId);
        assert.equal(own.status, 200, `${path}: authenticated OF ${self} own page`);
        assert.ok(own.body.includes(ownMarker), `${path}: own fictional marker visible`);
        assert.ok(!own.body.includes(otherMarker), `${path}: other OF marker absent`);
        const cross = await request(otherId);
        const denied = [401, 403, 404].includes(cross.status) ||
          /Organisme hors de ton périmètre Daily|Accès Studio refusé/.test(cross.body);
        assert.ok(denied, `${path}: OF ${self} must not access OF ${other}`);
        assert.ok(!cross.body.includes(otherMarker),
          `${path}: no other OF data may leak into the denied response`);
      }
    }
  });
