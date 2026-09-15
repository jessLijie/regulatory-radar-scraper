import test from "node:test";
import assert from "node:assert/strict";
import { DEMO_DATE, SAMPLE_PACKET, FIXED_PACKET, validDate, sourceLines, verifyFact, runChecks, reviewComplete, workpaperText } from "../local/kyc-rules.mjs";
import { attachFacts, validatePacket } from "../local/kyc-ai.mjs";

const facts = { registration: { value: "DEMO-COMPANY-001", lineId: "L2" }, identityExpiry: { value: "2028-06-30", lineId: "L3" }, addressIssued: { value: "2026-04-01", lineId: "L4" } };
const checks = (packet = SAMPLE_PACKET, overrides = {}) => runChecks({ packet, facts: { ...facts, ...overrides }, reviewDate: DEMO_DATE });
test("original case produces two passes and a calculated address exception", () => {
  const results = checks();
  assert.deepEqual(results.map((r) => r.status), ["pass", "pass", "exception"]);
  assert.match(results[2].condition, /166 calendar days/);
});
test("changing address evidence changes the deterministic result; stale values do not pass", () => {
  assert.equal(checks(FIXED_PACKET, { addressIssued: { value: "2026-09-01", lineId: "L4" } })[2].status, "pass");
  assert.equal(checks(FIXED_PACKET)[2].status, "review");
});
test("dates reject impossible and ambiguous inputs, including non-leap years", () => {
  for (const date of ["2026-02-29", "2026-02-30", "14/09/2026", "2026-13-01", "", "2026-9-14"]) assert.equal(validDate(date), null);
  assert.notEqual(validDate("2024-02-29"), null);
  assert.throws(() => runChecks({ packet: SAMPLE_PACKET, facts, reviewDate: "bad" }), /valid review date/);
});
test("identity accepts expiry on review date and flags the preceding day", () => {
  for (const [value, expected] of [["2026-09-13", "exception"], ["2026-09-14", "pass"], ["2026-09-15", "pass"]]) {
    assert.equal(checks(SAMPLE_PACKET.replace("2028-06-30", value), { identityExpiry: { value, lineId: "L3" } })[1].status, expected);
  }
});
test("address age boundaries are calendar days: 89, 90, 91 and future", () => {
  for (const [days, status] of [[89, "pass"], [90, "pass"], [91, "exception"], [-1, "review"]]) {
    const value = new Date(validDate(DEMO_DATE) - days * 86400000).toISOString().slice(0, 10);
    assert.equal(checks(SAMPLE_PACKET.replace("2026-04-01", value), { addressIssued: { value, lineId: "L4" } })[2].status, status);
  }
});
test("missing and placeholder registration values never pass the presence check", () => {
  for (const value of ["", "N/A", "not provided", "unknown", "2022-04-18", "-", "Not supplied", "Not found", "Unavailable", "TBD", "To be provided"]) {
    assert.equal(checks(SAMPLE_PACKET.replace("DEMO-COMPANY-001", value), { registration: { value, lineId: "L2" } })[0].status, "review");
  }
});
test("unsupported values and fabricated source IDs are visibly unverified", () => {
  const lines = sourceLines(SAMPLE_PACKET);
  assert.equal(verifyFact({ value: "invented", lineId: "L2" }, lines).verified, false);
  assert.equal(verifyFact({ value: "2026-04-01", lineId: "L99" }, lines).verified, false);
  const output = attachFacts({ ...facts, addressIssued: { value: "2026-09-01", lineId: "L4" } }, SAMPLE_PACKET);
  assert.equal(output.addressIssued.verified, false);
  assert.equal(output.registration.quote, lines[1].text);
});
test("input validation bounds bytes, characters and line count", () => {
  assert.equal(validatePacket(SAMPLE_PACKET), SAMPLE_PACKET);
  for (const value of [null, "short", "a".repeat(6001), "文".repeat(4000), "line\n".repeat(41)]) assert.throws(() => validatePacket(value));
});
test("human review cannot complete without all dispositions and required reasons", () => {
  const result = checks();
  const decisions = { K1: { status: "acknowledged" }, K2: { status: "acknowledged" }, K3: { status: "dismissed", note: " " } };
  assert.equal(reviewComplete(result, decisions), false);
  decisions.K3.note = "Reviewed a newer record outside this packet; original result retained.";
  assert.equal(reviewComplete(result, decisions), true);
  assert.equal(result[2].status, "exception");
  assert.equal(reviewComplete([], {}), false);
});
test("workpaper marks pending review as draft and separates BNM context from fictional criteria", () => {
  const paper = workpaperText({ reviewDate: DEMO_DATE, packet: SAMPLE_PACKET, findings: checks(), decisions: {}, reviewer: "", scopeNote: "", context: null, extraction: { model: "test", createdAt: "test-time", elapsedSeconds: 0, inputHash: "test-hash" }, generatedAt: "test-time" });
  for (const required of ["Draft", "DEMO-KYC-01", "No BNM source attached", "166 calendar days", "Cause: Not established", "not a signed, immutable", "test-hash"]) assert.ok(paper.includes(required));
});
