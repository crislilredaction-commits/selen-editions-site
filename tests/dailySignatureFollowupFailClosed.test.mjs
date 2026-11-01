import assert from "node:assert/strict";
import test from "node:test";
import { loadTypeScript } from "./helpers/loadTypeScript.mjs";

const orgId = "of-test";
const sessionId = "session-test";
const signatureId = "signature-test";
const oldSentAt = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString();
const futureExpiry = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();

function fixture(failure = null, overrides = {}) {
  const calls = [];
  let sends = 0;
  const admin = {
    from(table) {
      const query = {
        select() { return this; }, eq() { return this; }, contains() { return this; },
        in() { return this; }, order() { return this; }, limit() { return this; },
        gte() { return this; },
        async maybeSingle() {
          calls.push(table);
          if (table === "daily_convention_signatures") return {
            data: { id: signatureId, convention_id: "convention-test", session_id: sessionId,
              status: "pending", token: "secret", signatory_email: "learner@example.test",
              expires_at: overrides.expires_at ?? futureExpiry },
            error: failure === "signature" ? { message: "private SQL" } : null,
          };
          if (table === "daily_conventions") return {
            data: { id: "convention-test", session_id: sessionId, recipient_email: "learner@example.test",
              daily_sessions: { daily_formations: { title: "Formation" } } },
            error: failure === "convention" ? { message: "private SQL" } : null,
          };
          if (table === "daily_communications") {
            if (calls.filter((name) => name === table).length === 1) return {
              data: { id: "initial", sent_at: overrides.sent_at ?? oldSentAt },
              error: failure === "initial" ? { message: "private SQL" } : null,
            };
            return {
              data: { id: "existing-followup", sent_at: oldSentAt },
              error: failure === "recent" ? { message: "private SQL" } : null,
            };
          }
          throw Error("Unexpected table " + table);
        },
      };
      return query;
    },
  };
  const { POST } = loadTypeScript("app/api/client/daily/signature-invitations/followup/route.ts", {
    "next/server": { NextResponse: { json: (body, options = {}) => ({ status: options.status ?? 200, body }) } },
    "@/lib/server/dailyOrganisationContext": {
      getDailyOrganisationContext: async () => ({ ok: true, admin, organisationId: orgId, user: { id: "user-test" } }),
    },
    "@/lib/server/dailySignatureInvitationEmails": {
      prepareDailySignatureFollowupEmail: () => { throw Error("Should never prepare email"); },
      sendDailySignatureFollowup: async () => { sends++; throw Error("Should never send email"); },
    },
  });
  const post = () => POST({ url: "https://selen.example.test/api/client/daily/signature-invitations/followup",
    json: async () => ({ signature_id: signatureId }) });
  return { post, calls, get sends() { return sends; } };
}

test("P0 : un lien expiré ou sans expiration valide ne déclenche aucune relance", async () => {
  for (const expires_at of ["invalid", new Date(Date.now() - 1000).toISOString()]) {
    const f = fixture(null, { expires_at });
    const response = await f.post();
    assert.equal(response.status, 409);
    assert.match(response.body.error, /expiré|validité/i);
    assert.deepEqual(f.calls, ["daily_convention_signatures"]);
    assert.equal(f.sends, 0);
  }
});

test("P0 : les erreurs SQL des lectures empêchent les relances et ne sont pas exposées", async () => {
  for (const failure of ["signature", "convention", "initial", "recent"]) {
    const f = fixture(failure);
    const response = await f.post();
    assert.equal(response.status, 500, failure);
    assert.doesNotMatch(JSON.stringify(response.body), /private SQL/);
    assert.equal(f.sends, 0);
  }
});

test("P0 : une date d'envoi initial invalide ou future bloque la relance", async () => {
  for (const sent_at of ["not-a-date", new Date(Date.now() + 60_000).toISOString()]) {
    const f = fixture(null, { sent_at });
    const response = await f.post();
    assert.equal(response.status, 409);
    assert.match(response.body.error, /date/i);
    assert.equal(f.sends, 0);
  }
});

test("P0 : une relance existante reste idempotente après vérification des lectures", async () => {
  const f = fixture();
  const response = await f.post();
  assert.equal(response.status, 200);
  assert.equal(response.body.alreadyRecorded, true);
  assert.equal(f.sends, 0);
});
