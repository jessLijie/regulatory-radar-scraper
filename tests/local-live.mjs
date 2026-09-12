// Optional real-model smoke test. Start `npm run local` first. No mocks are used.
import assert from "node:assert/strict";
const url = "http://127.0.0.1:5180/api/local/analyze";
const policy =
  "1. All employee accounts must use multi-factor authentication.\n\n2. Privileged access must be reviewed at least quarterly.\n\n3. Security incidents must be reported to the security team within 24 hours.";
const controls =
  "C-01: Multi-factor authentication is enforced for all employee accounts.\n\nC-02: The IT manager reviews privileged access annually.\n\nC-03: Backups are completed every night.";
async function run(text) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ policy, controls: text }),
    signal: AbortSignal.timeout(310_000),
  });
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  assert.equal(
    result.findings.length,
    3,
    "Expected all three requirements to be identified.",
  );
  assert.ok(
    result.findings.every((item) => item.evidenceVerified),
    "All evidence should be quoted from the inputs.",
  );
  console.log(
    JSON.stringify(
      {
        model: result.model,
        seconds: result.elapsedSeconds,
        findings: result.findings,
      },
      null,
      2,
    ),
  );
  return result.findings;
}
const first = await run(controls);
assert.equal(
  first.find((f) => /multi-factor/i.test(f.policyQuote))?.status,
  "covered",
);
assert.equal(
  first.find((f) => /quarterly/i.test(f.policyQuote))?.status,
  "partial",
);
assert.equal(
  first.find((f) => /incidents/i.test(f.policyQuote))?.status,
  "gap",
);
const second = await run(controls.replace("annually", "quarterly"));
assert.equal(
  second.find((f) => /quarterly/i.test(f.policyQuote))?.status,
  "covered",
);
console.log(
  "PASS: real local inference distinguishes a frequency gap and responds to changed inputs.",
);
