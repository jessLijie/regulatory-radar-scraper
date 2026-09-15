import test from "node:test";
import assert from "node:assert/strict";
import {
  parsePublications,
  mergePublications,
  safeSourceUrl,
  sectionsFromPages,
  chooseSections,
  chooseBriefSections,
  parseDate,
  comparisonPassages,
} from "../local/radar-data.mjs";
import { verifyBrief, attachComparisonEvidence, generateBoundBriefPoints } from "../local/radar-ai.mjs";
import { pageDifferences, describeChanges, buildReviewNote, buildBriefNote } from "../local/radar-review.mjs";
import { publicationTags, matchesTopics, TOPICS } from "../local/radar-topics.mjs";

test("topic tags separate AML and KYC and allow multiple explicit title topics", () => {
  assert.deepEqual(publicationTags("Electronic Know-Your-Customer (e-KYC)"), ["kyc"]);
  assert.deepEqual(publicationTags("Anti-Money Laundering and Targeted Financial Sanctions"), ["aml"]);
  assert.deepEqual(publicationTags("AML and Customer Due Diligence (KYC)"), ["aml", "kyc"]);
  assert.deepEqual(publicationTags("Risk Management in Technology (RMiT)"), ["technology"]);
  assert.deepEqual(publicationTags("Exposure Draft on Open Finance"), ["technology", "data"]);
  assert.deepEqual(publicationTags("Shariah Governance"), ["governance", "islamic"]);
  assert.ok(publicationTags("Credit Card and Credit Card-i").includes("payments"));
  for (const title of ["Employee Screening", "Electronic Money (e-Money)", "Management of Customer Information", "Personal Financing"]) {
    assert.equal(publicationTags(title).some((id) => id === "aml" || id === "kyc"), false);
  }
  assert.deepEqual(publicationTags("A publication without a recognised topic"), ["other"]);
  assert.equal(matchesTopics(["aml"], ["kyc"]), false);
  assert.equal(matchesTopics(["aml"], ["aml", "kyc"]), true);
  assert.equal(matchesTopics(["other"], []), true);
  assert.equal(new Set(TOPICS.map((topic) => topic.id)).size, TOPICS.length);
});

test("brief calls isolate each passage and bind evidence on the server", async () => {
  const sections = [1, 2, 3, 4].map((page) => ({ id: `P${page}`, page, text: `Institutions must review the specific source requirement on page ${page}.` }));
  const chosen = chooseBriefSections(sections);
  assert.equal(chosen.length, 3);
  const seen = [];
  const model = { withStructuredOutput() { return { async invoke(messages) {
    const input = JSON.parse(messages[1][1]);
    assert.equal(input.passages, undefined);
    seen.push(input.passage.id);
    return { title: "Review", summary: "Review this requirement.", question: "What evidence supports this requirement?", sourceId: "WRONG", quote: "Invented quotation" };
  } }; } };
  const points = await generateBoundBriefPoints(model, { item: {}, selectedSections: chosen }, new AbortController().signal);
  assert.deepEqual(seen, chosen.map((item) => item.id));
  assert.deepEqual(points.map((item) => item.sourceId), seen);
  assert.deepEqual(points.map((item) => item.quote), chosen.map((item) => item.text));
  assert.ok(points.every((point) => !Object.hasOwn(point, "question")));
  const aborted = new AbortController(); aborted.abort();
  await assert.rejects(generateBoundBriefPoints(model, { item: {}, selectedSections: chosen }, aborted.signal), { name: "AbortError" });
});

test("page comparison preserves before/after evidence including added and removed positions", () => {
  const old = [{ number: 1, text: "Old wording" }, { number: 2, text: "Removed page" }];
  const current = [{ number: 1, text: "New wording" }, { number: 3, text: "Added page" }];
  assert.deepEqual(pageDifferences(current, old), [
    { page: 1, before: "Old wording", after: "New wording", kind: "changed" },
    { page: 2, before: "Removed page", after: "", kind: "removed" },
    { page: 3, before: "", after: "Added page", kind: "added" },
  ]);
});
test("no earlier snapshot and whitespace-only differences do not invent text changes", () => {
  const current = [{ number: 1, text: "Same  wording\nagain" }];
  assert.deepEqual(pageDifferences(current, null), []);
  assert.deepEqual(pageDifferences(current, [{ number: 1, text: "Same wording again" }]), []);
  assert.match(describeChanges({ previous: null }), /baseline/);
});
test("readable review exports edits and evidence, and rejects a mismatched brief version", () => {
  const doc = { item: { title: "Test publication", publishedAt: "2026-01-01", change: "unchanged" }, url: "https://www.bnm.gov.my/test", checkedAt: "test-time", retrievedAt: "test-time", textHash: "hash-a", previous: null, pageChanges: [] };
  const brief = { textHash: "hash-a", model: "test", createdAt: "test-time", sourceIds: ["P1"], points: [{ title: "Test observation", summary: "Test source summary", question: "Original question?", quote: "Exact source text", page: 1, verified: true }] };
  const output = buildReviewNote(doc, brief, { 0: "Edited question?" }, "Review note");
  assert.match(output, /Edited question\?/);
  assert.match(output, /Exact source text/);
  assert.match(output, /No earlier text snapshot/);
  assert.match(output, /Review note/);
  assert.throws(() => buildReviewNote(doc, { ...brief, textHash: "hash-b" }, {}, ""), /different source version/);
});
test("brief-only export preserves cached evidence but omits legacy questions and notes", () => {
  const doc = { item: { title: "Test publication", publishedAt: "2026-01-01" }, url: "https://www.bnm.gov.my/test", checkedAt: "test-time", retrievedAt: "test-time", textHash: "hash-a" };
  const brief = { schemaVersion: 3, textHash: "hash-a", model: "test", createdAt: "original-time", sourceIds: ["P1"], points: [{ title: "Observation", summary: "Source summary", question: "Legacy review question?", quote: "Exact source text", page: 1, verified: true }] };
  const output = buildBriefNote(doc, brief);
  assert.match(output, /Source summary/);
  assert.match(output, /Exact source text/);
  assert.match(output, /original-time/);
  assert.doesNotMatch(output, /question|YOUR REVIEW NOTES/i);
  assert.throws(() => buildBriefNote(doc, null), /Generate a brief/);
  assert.throws(() => buildBriefNote(doc, { ...brief, textHash: "hash-b" }), /different source version/);
  assert.equal(brief.schemaVersion, 3);
  assert.equal(brief.points[0].question, "Legacy review question?");
});

const html = `<table><tr><td><span class="hidden">2024/04/00</span>15 Apr 2024</td><td><p><a href="/documents/20124/test/policy.pdf">Electronic Know-Your-Customer (e-KYC)</a></p><ul><li><a href="/documents/20124/test/faq.pdf">FAQ</a> (updated 1 July 2026)</li></ul></td><td>Policy Document</td></tr></table>`;
test("attaches suggested checklist evidence without turning a match into compliance assurance", () => {
  const source = {
    id: "P8-S8.1",
    page: 8,
    text: "The Board must approve the framework.",
  };
  const controls = [{ id: "C1", text: "We prepare a framework." }];
  const finding = {
    controlId: "C1",
    title: "Board approval",
    reason: "Approval is not described.",
    nextStep: "Where is approval recorded?",
  };
  assert.equal(
    attachComparisonEvidence(finding, source, controls).status,
    "candidate",
  );
  assert.equal(
    attachComparisonEvidence(
      { ...finding, allRequiredDetailsExplicit: true },
      source,
      controls,
    ).status,
    "candidate",
  );
  assert.equal(
    attachComparisonEvidence(
      { ...finding, controlId: "NONE" },
      source,
      controls,
    ).status,
    "gap",
  );
  assert.equal(
    attachComparisonEvidence({ ...finding, controlId: "BAD" }, source, controls)
      .status,
    "review",
  );
  assert.equal(
    attachComparisonEvidence(
      { ...finding, controlId: "NONE", allRequiredDetailsExplicit: true },
      source,
      controls,
    ).status,
    "gap",
  );
  assert.equal(
    attachComparisonEvidence(finding, source, controls).controlQuote,
    controls[0].text,
  );
});
test("parses real-shaped listings without treating an FAQ update as a publication date", () => {
  const [item] = parsePublications(html);
  assert.equal(item.publishedAt, "2024-04-15");
  assert.equal(item.topic, "AML / KYC");
  assert.equal(item.attachments.length, 1);
  assert.equal(item.type, "Policy Document");
  assert.equal(parseDate("31 Feb 2024"), null);
  assert.deepEqual(
    parsePublications("<html>Temporarily unavailable</html>"),
    [],
  );
});
test("comparison extracts short standard excerpts, not guidance or fabricated sentences", () => {
  const text =
    "S 8.1 Institutions shall obtain Board approval of the internal framework for electronic customer verification. The framework must also address exceptions. G 8.2 Institutions may consider further safeguards. S 8.3 Institutions shall review or revalidate their verification measures every three years. Further context is available.";
  const passages = comparisonPassages([{ number: 8, text }]);
  assert.equal(passages.length, 2);
  assert.ok(passages.every((p) => text.includes(p.text) && p.page === 8));
  assert.ok(passages.every((p) => !p.text.includes("may consider")));
  assert.equal(passages[0].id, "P8-S8.3");
});
test("first scan is a baseline, repeated scans deduplicate, edits and additions are distinct", () => {
  const incoming = parsePublications(html);
  const baseline = mergePublications([], incoming, "2026-09-14T00:00:00Z");
  assert.equal(baseline[0].change, "baseline");
  const repeat = mergePublications(baseline, incoming, "2026-09-15T00:00:00Z");
  assert.equal(repeat.length, 1);
  assert.equal(repeat[0].change, "unchanged");
  assert.equal(repeat[0].firstSeenAt, baseline[0].firstSeenAt);
  const changed = mergePublications(
    repeat,
    parsePublications(html.replace("1 July 2026", "2 July 2026")),
    "2026-09-16T00:00:00Z",
  );
  assert.equal(changed[0].change, "listing");
  const added = mergePublications(
    repeat,
    [
      ...incoming,
      {
        ...incoming[0],
        id: "another",
        url: "https://www.bnm.gov.my/documents/other.pdf",
      },
    ],
    "2026-09-16T00:00:00Z",
  );
  assert.equal(added[1].change, "new");
  assert.equal(
    mergePublications(repeat, [], "2026-09-16T00:00:00Z")[0].available,
    false,
  );
});
test("rejects external, credential-bearing and non-HTTPS source URLs", () => {
  assert.equal(
    safeSourceUrl("/documents/a.pdf#page=3"),
    "https://www.bnm.gov.my/documents/a.pdf",
  );
  for (const value of [
    "http://127.0.0.1/",
    "https://bnm.gov.my.evil.test/",
    "https://user:secret@www.bnm.gov.my/",
    "https://www.bnm.gov.my:444/",
    "file:///C:/secret",
  ])
    assert.throws(() => safeSourceUrl(value));
});
test("passages preserve source text, page attribution and a bounded model context", () => {
  const text =
    "Institutions must verify customer identity before onboarding. ".repeat(
      100,
    );
  const sections = sectionsFromPages([{ number: 7, text }]);
  assert.ok(sections.length > 1);
  assert.ok(
    sections.every(
      (s) => s.page === 7 && text.includes(s.text) && s.text.length <= 1250,
    ),
  );
  const chosen = chooseSections(sections, 3700);
  assert.ok(chosen.reduce((n, s) => n + s.text.length + 40, 0) <= 3700);
});
test("attaches original evidence by reference and withholds unknown references", () => {
  const sections = [
    {
      id: "P2-1",
      page: 2,
      text: "Institutions must verify customer identity before onboarding.",
    },
  ];
  const point = {
    title: "Identity",
    summary: "Verify identity.",
    question: "How is identity verified?",
    sourceId: "P2-1",
    quote: sections[0].text,
  };
  assert.equal(verifyBrief({ points: [point] }, sections)[0].verified, true);
  assert.equal(
    verifyBrief(
      { points: [{ ...point, quote: "Made up evidence" }] },
      sections,
    )[0].quote,
    sections[0].text,
  );
  const invalid = verifyBrief(
    {
      points: [{ ...point, sourceId: "UNKNOWN" }],
    },
    sections,
  )[0];
  assert.equal(invalid.verified, false);
  assert.equal(invalid.quote, "");
  assert.match(invalid.summary, /withheld/);
});
