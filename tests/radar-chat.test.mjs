import test from "node:test";
import assert from "node:assert/strict";
import { knowledgeDocuments, knowledgeDocument, knowledgeMarkdown, knowledgeChanges, searchKnowledge, relevance } from "../local/internal-knowledge.mjs";
import { validateChatInput, prepareChat, verifiedChatReply } from "../local/radar-chat.mjs";

const id = "a".repeat(24);
const snapshot = { items: [{ id, title: "Electronic Know-Your-Customer (e-KYC)", publishedAt: "2024-04-15", available: true, url: "https://www.bnm.gov.my/test", change: "unchanged", type: "Policy Document" }], lastScan: { at: "2026-09-01T00:00:00Z", newCount: 0, changedCount: 0, documentsChecked: 1, count: 1, errors: [] }, documents: [{ item: { id, title: "Electronic Know-Your-Customer (e-KYC)", publishedAt: "2024-04-15", type: "Policy Document" }, url: "https://www.bnm.gov.my/test", textHash: "hash", retrievedAt: "2026-09-01", previous: null, sections: [{ page: 8, text: "A financial institution shall obtain Board approval on the overall risk appetite and internal framework governing e-KYC." }] }] };
test("mock knowledge API sources pin versions, retain labels, and reject stale hashes", () => {
  const current = knowledgeDocument("demo-kyc");
  const previous = knowledgeDocument("demo-kyc", "1.0");
  assert.equal(current.demo, true);
  assert.notEqual(current.textHash, previous.textHash);
  assert.match(previous.url, /version=1.0/);
  assert.match(knowledgeMarkdown(current), /fictional/i);
  assert.equal(knowledgeDocument("unknown"), null);
  assert.throws(() => knowledgeDocument("demo-kyc", "1.0", current.textHash), /no longer matches/);
  assert.equal(knowledgeChanges("demo-kyc").changes.length, 3);
  assert.equal(knowledgeChanges("demo-access"), null);
  assert.ok(searchKnowledge("privileged access").every((source) => source.demo && source.textHash && source.url));
  assert.equal(searchKnowledge("zzzzzzzz").length, 0);
});
test("chat validates input, unknown client evidence and bounded history", () => {
  assert.throws(() => validateChatInput({ question: "x" }));
  assert.throws(() => validateChatInput({ question: "Hello", sources: ["invented"] }));
  assert.throws(() => validateChatInput({ question: "Hello", scope: "current" }));
  assert.throws(() => validateChatInput({ question: "Hello", history: Array(5).fill({ role: "user", content: "Hi" }) }));
});
test("latest dates, scan coverage and missing BNM history are not fabricated", () => {
  const latest = prepareChat(validateChatInput({ question: "What are the latest BNM publications?" }), snapshot).direct;
  assert.match(latest.answer, /2024-04-15/);
  const changed = prepareChat(validateChatInput({ question: "Which policies changed in the last scan?" }), snapshot).direct;
  assert.match(changed.answer, /0 newly discovered/);
  assert.match(changed.answer, /limited scan coverage/);
  const baseline = prepareChat(validateChatInput({ question: "What changed?", scope: "current", publicationId: id }), snapshot).direct;
  assert.match(baseline.answer, /No earlier saved BNM text/);
  const namedBaseline = prepareChat(validateChatInput({ question: "What changed in BNM e-KYC?" }), snapshot).direct;
  assert.match(namedBaseline.answer, /No earlier saved BNM text/);
});
test("fictional version comparison cites both actual sample versions", () => {
  const result = prepareChat(validateChatInput({ question: "What changed in our demo KYC policy?" }), snapshot).direct;
  assert.match(result.answer, /fictional sample versions/);
  assert.match(result.answer, /24 months/);
  assert.match(result.answer, /12 months/);
  assert.equal(result.sources.length, 2);
  assert.ok(result.sources.every((source) => /fictional/.test(source.kind)));
});
test("comparison retrieval contains both authorities with unique citations", () => {
  const result = prepareChat(validateChatInput({ question: "Compare BNM e-KYC Board approval with our internal KYC policy." }), snapshot);
  assert.ok(result.sources.some((source) => source.family === "bnm"));
  assert.ok(result.sources.some((source) => source.family === "internal"));
  assert.ok(result.sources.some((source) => source.family === "internal" && /KYC-03/.test(source.title)));
  assert.equal(relevance("onboarding", ["board"]), 0);
  assert.equal(new Set(result.sources.map((source) => source.id)).size, result.sources.length);
  assert.ok(result.sources.length <= 4);
  assert.ok(Buffer.byteLength(JSON.stringify(result.sources), "utf8") <= 13000);
  const noBnm = prepareChat(validateChatInput({ question: "Compare BNM e-KYC with our internal KYC policy." }), { ...snapshot, documents: [] });
  assert.match(noBnm.direct.answer, /both policies/);
});
test("comparisons never substitute a different named policy", () => {
  const unloadedId = "b".repeat(24);
  const catalog = { ...snapshot, items: [...snapshot.items, { id: unloadedId, title: "Risk Management in Technology (RMiT)", available: true }] };
  const missing = prepareChat(validateChatInput({ question: "Compare BNM Risk Management in Technology with our internal access policy" }), catalog);
  assert.match(missing.direct.answer, /won't substitute/);
  const incident = prepareChat(validateChatInput({ question: "Compare BNM e-KYC with our internal incident policy" }), snapshot);
  assert.ok(incident.sources.some((item) => item.documentId === "demo-incidents"));
  assert.ok(incident.sources.every((item) => item.documentId !== "demo-kyc"));
});
test("focused comparisons retain the relevant complete sentence instead of combining neighbouring duties", () => {
  const primary = "A financial institution shall obtain Board approval on the overall risk appetite and internal framework governing e-KYC.";
  const doc = { ...snapshot.documents[0], sections: [{ page: 8, text: `${primary} The framework shall address internal triggers for escalation to the Board.` }] };
  const result = prepareChat(validateChatInput({ question: "Compare BNM e-KYC Board approval with our internal KYC policy." }), { ...snapshot, documents: [doc] });
  assert.equal(result.sources.find((item) => item.family === "bnm").text, primary);
});
test("intent matching uses words and last-scan questions use scan metadata", () => {
  const exchange = prepareChat(validateChatInput({ question: "What are the latest currency exchange publications?" }), snapshot);
  assert.doesNotMatch(exchange.direct.answer, /Last BNM scan/);
  const scan = prepareChat(validateChatInput({ question: "What did the last scan find?" }), snapshot);
  assert.match(scan.direct.answer, /Last BNM scan/);
  const ordinary = prepareChat(validateChatInput({ question: "What does Singapore say about customer verification?" }), snapshot);
  assert.equal(ordinary.compareRequested, false);
});
test("unsupported citations are withheld and valid source identity is not semantic verification", () => {
  const sources = [{ id: "S1", family: "internal", title: "demo", kind: "fictional", text: "evidence" }];
  const answer = (text, sourceIds) => ({ points: [{ text, sourceIds }], insufficientEvidence: false });
  assert.match(verifiedChatReply(answer("Made up", ["S9"]), sources).answer, /withheld/);
  assert.match(verifiedChatReply(answer("Uncited fact", []), sources).answer, /withheld/);
  assert.match(verifiedChatReply({ answer: "Unattached fact", sourceIds: ["S1"], insufficientEvidence: false }, sources).answer, /withheld/);
  assert.match(verifiedChatReply(answer("Fact [S9:2]", ["S1"]), sources).answer, /withheld/);
  const valid = verifiedChatReply(answer("The sample says this", ["S1"]), sources);
  assert.equal(valid.sources.length, 1);
  assert.match(valid.answer, /\[S1\]/);
  assert.match(valid.answer, /Fictional internal-policy/);
  assert.match(valid.scope, /not the model/);
});
test("direct routes respect selected source scope", () => {
  for (const question of ["What are the latest publications?", "What changed in our demo KYC policy?"]) {
    assert.match(prepareChat(validateChatInput({ question, scope: "current", publicationId: id }), snapshot).direct.answer, /Choose/);
  }
  assert.match(prepareChat(validateChatInput({ question: "What are the latest BNM publications?", scope: "internal" }), snapshot).direct.answer, /Choose/);
});
