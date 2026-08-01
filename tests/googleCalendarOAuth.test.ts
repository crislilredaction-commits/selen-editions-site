import assert from "node:assert/strict";
import test from "node:test";

import { GET, POST } from "../app/api/calendly/webhook/route";
import {
  GoogleOAuthError,
  refreshGoogleAccessToken,
} from "../lib/server/googleOAuth";

const config = {
  clientId: "client-id",
  clientSecret: "client-secret",
  refreshToken: "refresh-token",
};

test("Google renouvelle un access token expire cote serveur", async () => {
  let requestBody = "";
  const token = await refreshGoogleAccessToken(config, async (_input, init) => {
    requestBody = String(init?.body);
    return Response.json({ access_token: "new-access-token", expires_in: 3600 });
  });

  assert.equal(token, "new-access-token");
  assert.match(requestBody, /grant_type=refresh_token/);
  assert.match(requestBody, /refresh_token=refresh-token/);
});

test("un refresh token revoque produit une erreur sure de reconnexion", async () => {
  const providerDetail = "sensitive-provider-detail";
  await assert.rejects(
    refreshGoogleAccessToken(config, async () =>
      Response.json(
        { error: "invalid_grant", error_description: providerDetail },
        { status: 400 },
      ),
    ),
    (error: unknown) => {
      assert.ok(error instanceof GoogleOAuthError);
      assert.equal(error.code, "invalid_grant");
      assert.equal(error.reconnectRequired, true);
      assert.doesNotMatch(error.message, new RegExp(providerDetail));
      assert.doesNotMatch(error.message, /refresh-token|client-secret/);
      return true;
    },
  );
});

test("le webhook Calendly retire repond 410 sans traitement metier", async () => {
  assert.equal((await GET()).status, 410);
  assert.equal((await POST()).status, 410);
});
