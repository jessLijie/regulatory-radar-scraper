// Optional live check: requires local Ollama and saved BNM e-KYC source text.
import assert from "node:assert/strict";
import { chatKnowledgeSnapshot } from "../local/radar-data.mjs";
import { validateChatInput, prepareChat, generateChatReply, verifiedChatReply } from "../local/radar-chat.mjs";
const input = validateChatInput({ question: "Compare BNM e-KYC Board approval with our internal KYC policy." });
const prepared = prepareChat(input, chatKnowledgeSnapshot());
assert.ok(prepared.sources, "Open and save the BNM e-KYC document in the app first.");
assert.ok(prepared.sources.some((source) => source.family === "bnm" && /Board approval/i.test(source.text)), "Retrieve the requested BNM approval passage, not a generic e-KYC definition.");
assert.ok(prepared.sources.some((source) => source.family === "internal" && /KYC-03/.test(source.title)), "Retrieve the corresponding demo Board oversight clause.");
console.log("Retrieved:", prepared.sources.map((source) => ({ id: source.id, title: source.title, page: source.page })));
const raw = await generateChatReply(input, prepared, AbortSignal.timeout(180000));
console.log("Model output:", JSON.stringify(raw, null, 2));
const verified = verifiedChatReply(raw, prepared.sources);
assert.ok(verified.sources.length >= 2, "A comparison must return cited evidence from both policies.");
assert.ok(verified.sources.some((source) => source.family === "bnm"));
assert.ok(verified.sources.some((source) => source.family === "internal"));
assert.match(verified.answer, /fictional|demo/i);
console.log("Live citation checks passed. Review interpretation against source text separately.");
