import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";

// Replace this read-only provider with an authenticated internal-document service
// in a real deployment. These fixtures are NOT a bank's policies.
const policies = JSON.parse(readFileSync(new URL("./knowledge/demo-internal-policies.json", import.meta.url), "utf8"));
export const DEMO_LABEL = "DEMO internal policy — fictional";
const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
export function knowledgeDocument(id, version, expectedHash) {
  const policy = policies.find((item) => item.id === id);
  if (!policy) return null;
  const selected = version ? policy.versions.find((item) => item.version === version) : policy.versions[0];
  if (!selected) return null;
  const result = { id: policy.id, title: policy.title, owner: policy.owner, demo: true, sourceType: DEMO_LABEL, ...selected };
  result.textHash = hash(result);
  if (expectedHash && expectedHash !== result.textHash) throw new Error("This sample source has changed; its saved citation hash no longer matches.");
  result.url = `/api/knowledge/documents/${policy.id}?version=${selected.version}&hash=${result.textHash}&format=markdown`;
  return result;
}
export function knowledgeDocuments() {
  return policies.map((policy) => ({ ...knowledgeDocument(policy.id), versions: policy.versions.map((item) => ({ version: item.version, date: item.date })) }));
}
export function knowledgeMarkdown(doc) {
  return `# ${doc.title}\n\n${DEMO_LABEL}. Interview demonstration only. Not issued or approved by a bank or BNM.\n\nVersion: ${doc.version}\nSample date: ${doc.date}\nOwner: ${doc.owner}\nSHA-256: ${doc.textHash}\n\n` + doc.sections.map((section) => `## ${section.id} — ${section.title}\n\n${section.text}`).join("\n\n");
}
export function knowledgeChanges(id) {
  const policy = policies.find((item) => item.id === id);
  if (!policy || policy.versions.length < 2) return null;
  const current = knowledgeDocument(id);
  const previous = knowledgeDocument(id, policy.versions[1].version);
  const ids = [...new Set([...current.sections, ...previous.sections].map((item) => item.id))];
  return { current, previous, changes: ids.flatMap((sectionId) => {
    const before = previous.sections.find((section) => section.id === sectionId)?.text || "";
    const after = current.sections.find((section) => section.id === sectionId)?.text || "";
    return before === after ? [] : [{ sectionId, before, after }];
  }) };
}
const stops = new Set("a an and are as at be by can do does for from how i in is it me of on or our please policy policies publication publications the their this to us what when which with you your latest newest recent new changed changes updates update last scan compare between internal bnm demo sample".split(" "));
export function queryTerms(query) {
  let text = query.toLowerCase().normalize("NFKC");
  if (/\bkyc\b|know.your.customer/.test(text)) text += " identity customer verification";
  if (/\baml\b/.test(text)) text += " laundering terrorism";
  if (/cyber|rmit/.test(text)) text += " technology security";
  return [...new Set(text.match(/[a-z0-9]{2,}/g) || [])].filter((word) => !stops.has(word));
}
export function relevance(text, terms) { const words = new Set(text.toLowerCase().match(/[a-z0-9]+/g) || []); return terms.reduce((score, word) => score + (words.has(word) ? 1 : 0), 0); }
export function searchKnowledge(query) {
  const terms = queryTerms(query);
  return knowledgeDocuments().flatMap((doc) => doc.sections.map((section) => ({ ...section, documentId: doc.id, documentTitle: doc.title, version: doc.version, sourceType: DEMO_LABEL, demo: true, textHash: doc.textHash, url: doc.url, score: relevance(`${doc.title} ${section.title} ${section.text}`, terms) }))).filter((item) => item.score > 0).sort((a, b) => b.score - a.score).slice(0, 8);
}
