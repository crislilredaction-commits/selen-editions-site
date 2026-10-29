import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fixture } from "./helpers/dailyCandidatureFollowupFixture.mjs";
const require = createRequire(import.meta.url);
function visibleText(node) {
    if (Array.isArray(node))
        return node.map(visibleText).join(" ");
    if (typeof node === "string" || typeof node === "number")
        return String(node);
    return node?.props ? visibleText(node.props.children) : "";
}
import { loadTypeScript as load } from "./helpers/loadTypeScript.mjs";
const projection = load("lib/daily/candidatureSummary.ts");
const reader = load("lib/server/dailyCandidatureFollowup.ts", { "../daily/candidatureSummary": projection });
const snapshot = load("lib/server/dailySessionFollowupSummary.ts", { "./dailyCandidatureFollowup": reader });
async function render(f) {
    const { summary } = await snapshot.loadDailySessionFollowupSnapshot(f.admin, "of", "session");
    let state = 0;
    const ui = load("components/daily/DailySessionFollowupSummary.tsx", {
        "react/jsx-runtime": require("react/jsx-runtime"),
        react: { useState: initial => [state++ === 0 ? summary : initial, () => { }], useEffect() { } },
        "@/components/AgentAssistanceBanner": { assistanceFetch() { throw new Error("Network forbidden"); } }
    });
    return visibleText(ui.default({ sessionId: "session" }));
}
test("Daily renders the current seven notes and identity from the authorized snapshot", async () => {
    const f = fixture();
    const text = await render(f);
    for (let i = 0; i < 7; i++)
        assert.ok(text.includes("SECTION_" + i));
    assert.match(text, /Ada Test/);
    assert.doesNotMatch(text, /PRIVATE_AGENT|PRIVATE_METADATA/);
    f.rows.daily_formation_registration_requests[0].agent_analysis_summary.observations = "Note corrigée actuelle";
    assert.match(await render(f), /Note corrigée actuelle/);
});
test("Daily followup does not retain notes from an inactive inscription", async () => {
    const f = fixture();
    f.rows.daily_session_enrolments[0].status = "abandoned";
    const text = await render(f);
    assert.doesNotMatch(text, /SECTION_[0-6]/);
    assert.match(text, /Aucune synthèse/);
});
