import test from "node:test";
import assert from "node:assert/strict";
import {
  validateInput,
  verifyEvidence,
  outputSchema,
} from "../local/analysis.mjs";

const policy =
  "All staff accounts must use MFA. Access reviews must occur quarterly.";
const controls =
  "MFA is enforced for all staff accounts. Access reviews occur annually.";
const finding = {
  title: "Access reviews",
  status: "partial",
  policyQuote: "Access reviews must occur quarterly.",
  controlQuote: "Access reviews occur annually.",
  reason: "Annual reviews do not meet the quarterly frequency.",
  nextStep: "Review quarterly.",
};
test("accepts short excerpts, rejects empty, oversized and context-heavy inputs", () => {
  assert.deepEqual(validateInput({ policy, controls }), { policy, controls });
  assert.throws(() => validateInput({ policy: "", controls }));
  assert.throws(() => validateInput({ policy: "x".repeat(4001), controls }));
  assert.throws(() => validateInput({ policy: "规".repeat(4000), controls }));
});
test("structured results have a bounded, explicit schema", () => {
  assert.equal(
    outputSchema.parse({ findings: [finding], moreRequirements: false })
      .findings.length,
    1,
  );
  assert.throws(() =>
    outputSchema.parse({
      findings: [{ ...finding, status: "compliant" }],
      moreRequirements: false,
    }),
  );
});
test("keeps verifiable quotes and rejects invented policy/control evidence", () => {
  const valid = verifyEvidence({ findings: [finding] }, policy, controls)[0];
  assert.equal(valid.status, "partial");
  assert.equal(valid.evidenceVerified, true);
  const invented = verifyEvidence(
    {
      findings: [
        {
          ...finding,
          status: "covered",
          controlQuote: "Access reviews occur quarterly.",
        },
      ],
    },
    policy,
    controls,
  )[0];
  assert.equal(invented.status, "review");
  assert.equal(invented.controlQuote, "");
  assert.equal(invented.evidenceVerified, false);
  assert.ok(!invented.reason.includes("Annual"));
  assert.equal(
    verifyEvidence(
      { findings: [{ ...finding, policyQuote: "Reviews must occur daily." }] },
      policy,
      controls,
    )[0].status,
    "review",
  );
});
test("allows gaps without controls, but fails fabricated gap evidence", () => {
  assert.equal(
    verifyEvidence(
      { findings: [{ ...finding, status: "gap", controlQuote: "" }] },
      policy,
      controls,
    )[0].evidenceVerified,
    true,
  );
  assert.equal(
    verifyEvidence(
      {
        findings: [
          {
            ...finding,
            status: "gap",
            controlQuote: "Imaginary control sentence.",
          },
        ],
      },
      policy,
      controls,
    )[0].status,
    "review",
  );
});
test("tolerates whitespace only and deduplicates identical requirement quotes", () => {
  const results = verifyEvidence(
    { findings: [finding, finding] },
    policy.replace("must occur", "must\n occur"),
    controls,
  );
  assert.equal(results.length, 1);
  assert.equal(results[0].evidenceVerified, true);
  assert.equal(
    verifyEvidence(
      {
        findings: [
          { ...finding, controlQuote: "access reviews occur annually." },
        ],
      },
      policy,
      controls,
    )[0].status,
    "review",
  );
});
