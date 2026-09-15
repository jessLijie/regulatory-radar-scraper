// Evidence comparisons are mechanical, not interpretations of regulatory amendments.
const normalize = (text) => text.normalize("NFC").replace(/\s+/gu, " ").trim();
export function pageDifferences(current, previous) {
  if (!previous) return [];
  const old = new Map(previous.map((page) => [page.number, page.text]));
  const next = new Map(current.map((page) => [page.number, page.text]));
  return [...new Set([...old.keys(), ...next.keys()])].sort((a, b) => a - b).flatMap((page) => {
    const before = old.get(page) ?? "";
    const after = next.get(page) ?? "";
    if (old.has(page) && next.has(page) && normalize(before) === normalize(after)) return [];
    return [{ page, before, after, kind: !old.has(page) ? "added" : !next.has(page) ? "removed" : "changed" }];
  });
}
export function describeChanges(doc) {
  if (!doc.previous) return "No earlier text snapshot is saved. This is a baseline, so the app cannot say what changed before it first read this document.";
  const count = (doc.pageChanges || []).length;
  return `${count} page position${count === 1 ? "" : "s"} differ from the previous distinct text snapshot, retrieved ${doc.previous.retrievedAt}. These are extracted-text differences; layout changes can shift content between pages. They are not confirmed regulatory amendments.`;
}
export function buildBriefNote(doc, brief) {
  if (!brief) throw new Error("Generate a brief before exporting it.");
  if (brief.textHash !== doc.textHash) throw new Error("This AI brief belongs to a different source version. Reopen the publication before using or exporting it.");
  const lines = ["REGULATORY RADAR — BNM BRIEF", "AI-generated reading aid; not a compliance conclusion.", "", doc.item.title,
    `Source: ${doc.url}`, `Publication date: ${doc.item.publishedAt || "Not stated"}`, `Source checked: ${doc.checkedAt}`,
    `Current text retrieved: ${doc.retrievedAt}`, `Current text SHA-256: ${doc.textHash}`, "", "KEY POINTS",
    "This brief explains selected passages of the current source, not the full document or changes between versions."];
  brief.points.forEach((point, i) => lines.push("", `${i + 1}. ${point.title}`, point.summary,
    `Evidence — physical page ${point.page ?? "not available"}: ${point.quote || "No verified source quote"}`,
    `Quote reference verified: ${point.verified ? "yes; meaning is not verified" : "NO — do not rely on this point"}`));
  lines.push("", `AI model: ${brief.model} | Generated: ${brief.createdAt} | Selected passage IDs: ${brief.sourceIds.join(", ")}`,
    "", "SCOPE", "Verify scope, effective dates, applicability and interpretation in the original document. Related attachments are not included. A newly discovered item is not necessarily a new regulation. A draft is not a final obligation.");
  return lines.join("\n");
}
// Retained for older review-note exports; the active app uses buildBriefNote.
export function buildReviewNote(doc, brief, questions, notes) {
  if (brief && brief.textHash !== doc.textHash) throw new Error("This AI brief belongs to a different source version. Reopen the publication before using or exporting it.");
  const lines = ["REGULATORY RADAR — BNM REVIEW NOTE", "Draft for human review; not a compliance conclusion.", "", doc.item.title,
    `Source: ${doc.url}`, `Publication date: ${doc.item.publishedAt || "Not stated"}`, `Source checked: ${doc.checkedAt}`,
    `Current text retrieved: ${doc.retrievedAt}`, `Current text SHA-256: ${doc.textHash}`, "", "WHAT CHANGED", describeChanges(doc)];
  if (doc.item.change === "listing") lines.push("The publication listing changed. Earlier listing field values were not retained, so no exact metadata before/after comparison is claimed.");
  if (doc.previous) {
    lines.push(`Previous text SHA-256: ${doc.previous.textHash}`);
    for (const change of doc.pageChanges || []) lines.push(`Page position ${change.page}: ${change.kind}`, `BEFORE: ${change.before || "No text at this position"}`, `AFTER: ${change.after || "No text at this position"}`, "");
  }
  lines.push("", "SOURCE BRIEF & REVIEW QUESTIONS", "AI explains selected passages of the current source, not the change between versions. Verify scope, effective dates, applicability and interpretation in the full source.");
  if (brief) {
    brief.points.forEach((point, i) => lines.push("", `${i + 1}. ${point.title}`, point.summary,
      `Review question (editable draft): ${questions[i] ?? point.question}`, `Evidence — physical page ${point.page ?? "not available"}: ${point.quote || "No verified source quote"}`,
      `Quote reference verified: ${point.verified ? "yes; meaning is not verified" : "NO — do not rely on this point"}`));
    lines.push("", `AI model: ${brief.model} | Generated: ${brief.createdAt} | Selected passage IDs: ${brief.sourceIds.join(", ")}`);
  } else lines.push("No AI brief generated.");
  lines.push("", "YOUR REVIEW NOTES", notes.trim() || "No notes recorded.", "", "SCOPE", "This note covers one publication and selected AI passages. Related attachments are not included. A newly discovered item is not necessarily a new regulation. A draft is not a final obligation. Human verification is required.");
  return lines.join("\n");
}
