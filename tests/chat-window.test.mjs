import test from "node:test";
import assert from "node:assert/strict";
import { clampChatPosition, parseChatTransfer } from "../local/chat-window.ts";
test("chat stays within the viewport on dragging and resizing", () => {
  const panel = { width: 410, height: 600 };
  assert.deepEqual(clampChatPosition({ x: -400, y: -300 }, panel, { width: 1200, height: 800 }), { x: 12, y: 12 });
  assert.deepEqual(clampChatPosition({ x: 2000, y: 1500 }, panel, { width: 1200, height: 800 }), { x: 778, y: 188 });
  assert.deepEqual(clampChatPosition({ x: 778, y: 188 }, { width: 351, height: 620 }, { width: 375, height: 844 }), { x: 12, y: 188 });
});
const snapshot = { version: 1, messages: [{ role: "assistant", text: "A fictional answer [D1]", sources: [{ id: "D1", title: "Demo KYC", kind: "fictional", url: "/api/knowledge/documents/demo-kyc?version=1.0", text: "original passage" }] }], draft: "Follow-up question", scope: "current", publication: { id: "a".repeat(24), title: "e-KYC" } };
test("tab handoff preserves conversation, citations, draft, and publication context", () => {
  assert.deepEqual(parseChatTransfer(snapshot), snapshot);
  assert.equal(parseChatTransfer({ ...snapshot, publication: null }), null);
  assert.equal(parseChatTransfer({ ...snapshot, draft: "x".repeat(1501) }), null);
  assert.equal(parseChatTransfer({ ...snapshot, messages: Array(501).fill(snapshot.messages[0]) }), null);
});
test("handoff rejects unsafe citation links and invalid packet shapes", () => {
  for (const url of ["javascript:alert(1)", "https://evil.example/", "//evil.example/", "https://user:pass@bnm.gov.my/"]) {
    const message = { ...snapshot.messages[0], sources: [{ ...snapshot.messages[0].sources[0], url }] };
    assert.equal(parseChatTransfer({ ...snapshot, messages: [message] }), null);
  }
  assert.equal(parseChatTransfer(null), null);
  assert.equal(parseChatTransfer({}), null);
});
