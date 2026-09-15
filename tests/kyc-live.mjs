// Optional real-model smoke test. Requires the local app and Ollama; no fixtures replace AI output.
import assert from "node:assert/strict";
import { SAMPLE_PACKET, FIXED_PACKET, DEMO_DATE, runChecks } from "../local/kyc-rules.mjs";

for (const [label, packet, addressDate, expectedStatus] of [
  ["original", SAMPLE_PACKET, "2026-04-01", "exception"],
  ["updated", FIXED_PACKET, "2026-09-01", "pass"],
]) {
  const response = await fetch("http://127.0.0.1:5180/api/kyc/extract", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:5180" },
    body: JSON.stringify({ packet }), signal: AbortSignal.timeout(300_000),
  });
  const output = await response.json();
  assert.equal(response.status, 200, output.error);
  assert.equal(output.facts.registration.value, "DEMO-COMPANY-001");
  assert.equal(output.facts.identityExpiry.value, "2028-06-30");
  assert.equal(output.facts.addressIssued.value, addressDate);
  assert.ok(Object.values(output.facts).every((fact) => fact.verified));
  const results = runChecks({ packet, facts: output.facts, reviewDate: DEMO_DATE });
  assert.deepEqual(results.map((result) => result.status), ["pass", "pass", expectedStatus]);
  console.log(`${label}: real ${output.model} extraction in ${output.elapsedSeconds}s; address result ${expectedStatus}; source-linked values verified.`);
}
console.log("Two synthetic live cases passed. This is a smoke test, not an accuracy benchmark or compliance validation.");
