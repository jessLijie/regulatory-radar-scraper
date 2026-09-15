// Deliberately fictional, bounded criteria. These are NOT extracted BNM requirements.
export const DEMO_DATE = "2026-09-14";
export const DEMO_POLICY = {
  id: "DEMO-KYC-01",
  version: "1.0",
  title: "Fictional onboarding file policy",
  rules: [
    { id: "K1", field: "registration", title: "Company registration", criterion: "A company registration reference must be recorded in the supplied file." },
    { id: "K2", field: "identityExpiry", title: "Identity expiry", criterion: "The supplied identity record must not have expired on the review date. Expiry on the review date is accepted in this demo." },
    { id: "K3", field: "addressIssued", title: "Address proof age", criterion: "The supplied address proof must have been issued within the preceding 90 calendar days, including the review date." },
  ],
};
export const FACT_FIELDS = [
  { key: "registration", label: "Registration reference" },
  { key: "identityExpiry", label: "Identity expiry date" },
  { key: "addressIssued", label: "Address proof issue date" },
];
export const SAMPLE_PACKET = `FICTIONAL TRAINING FILE — Atlas Orchard Trading. No real customer data.
Company registration extract: reference DEMO-COMPANY-001; registered on 2022-04-18.
Identity record for Avery Tan (fictional): identity expires on 2028-06-30.
Address proof for Avery Tan (fictional): statement issued on 2026-04-01.
This is a text-only demonstration. Document authenticity and ownership have not been verified.`;
export const FIXED_PACKET = SAMPLE_PACKET.replace("2026-04-01", "2026-09-01");

export function sourceLines(packet) {
  return packet.split(/\r?\n/).map((text, i) => ({ id: `L${i + 1}`, text }));
}
export function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? date.getTime() : null;
}
export function verifyFact(fact, lines) {
  const line = lines.find((item) => item.id === fact?.lineId);
  const value = typeof fact?.value === "string" ? fact.value.trim() : "";
  const verified = Boolean(value && line && line.text.includes(value));
  return { value, lineId: line?.id || "", quote: line?.text || "", verified,
    origin: fact?.origin === "human" ? "human" : "ai" };
}
export function runChecks({ packet, facts, reviewDate }) {
  const reviewTime = validDate(reviewDate);
  if (reviewTime === null) throw new Error("Choose a valid review date (YYYY-MM-DD).");
  const lines = sourceLines(packet);
  return DEMO_POLICY.rules.map((rule) => {
    const evidence = verifyFact(facts[rule.field], lines);
    let status = "review";
    let condition = "No source-verified value was supplied. The record may exist elsewhere; do not infer a customer failure.";
    let nextStep = "Obtain or verify the relevant record and rerun the check.";
    if (evidence.verified && rule.field === "registration") {
      // Conservative demo parser: free-text absence markers are never identifiers.
      const missing = !/^(?=.*\d)[A-Za-z0-9][A-Za-z0-9()/_-]{2,99}$/.test(evidence.value) || validDate(evidence.value) !== null;
      if (!missing) {
        status = "pass";
        condition = `Registration reference ${evidence.value} is recorded in the supplied text.`;
        nextStep = "This presence check does not authenticate a registration or establish ownership.";
      } else condition = "The supplied value is a placeholder, date or unsupported reference format. Verify the registration reference manually.";
    } else if (evidence.verified) {
      const time = validDate(evidence.value);
      if (time === null) {
        condition = `The value “${evidence.value}” is not an unambiguous, valid YYYY-MM-DD date.`;
        nextStep = "Verify the date in the original document. Do not guess its format.";
      } else if (rule.field === "identityExpiry") {
        status = time >= reviewTime ? "pass" : "exception";
        condition = `Identity expiry ${evidence.value} is ${status === "pass" ? "on or after" : "before"} the review date ${reviewDate}.`;
        nextStep = status === "pass" ? "Document authenticity and identity matching are outside this check." : "Request a current identity record; assess the exception with the file owner.";
      } else {
        const age = Math.round((reviewTime - time) / 86_400_000);
        status = age < 0 ? "review" : age <= 90 ? "pass" : "exception";
        condition = age < 0 ? `Issue date ${evidence.value} is after the review date.` : `Address proof is ${age} calendar days old on ${reviewDate}; the fictional policy limit is 90 days.`;
        nextStep = status === "pass" ? "This date check does not verify the address or the document's authenticity." : age < 0 ? "Clarify the future-dated evidence before concluding." : "Request updated address evidence and rerun this check.";
      }
    }
    return { ...rule, status, condition, nextStep, evidence };
  });
}

export function reviewComplete(findings, decisions) {
  return findings.length > 0 && findings.every((finding) => {
    const decision = decisions[finding.id];
    if (!decision) return false;
    if (finding.status === "pass") return decision.status === "acknowledged";
    return ["confirmed", "dismissed"].includes(decision.status) && Boolean(decision.note?.trim());
  });
}

export function workpaperText({ reviewDate, packet, findings, decisions, reviewer, scopeNote, extraction, context, generatedAt }) {
  const complete = Boolean(reviewer.trim()) && reviewComplete(findings, decisions);
  const lines = [
    "REGULATORY RADAR | KYC FILE REVIEW",
    "Fictional training case · WP-KYC-001 · Not a customer approval",
    `Status: ${complete ? "Demo review completed" : "Draft — human review incomplete"}`,
    `Reviewer label (not authenticated): ${reviewer.trim() || "Not supplied"}`,
    `Review date: ${reviewDate} | Workpaper generated: ${generatedAt}`,
    "", "OBJECTIVE & SCOPE",
    "Check one supplied text packet against three fictional onboarding file criteria. This is not an AML audit, document-authenticity test or compliance opinion.",
    `Criteria: ${DEMO_POLICY.id} v${DEMO_POLICY.version}. User approved these fixed criteria for the demo run. No BNM requirement is inferred from them.`,
    `Procedure: local AI proposes field values and source lines; user reviews/corrects them; deterministic code compares presence and dates; user reviews each result.`,
    `Scope / reviewer note: ${scopeNote.trim() || "Not supplied"}`,
    "", "REGULATORY CONTEXT (NOT TEST CRITERIA)",
  ];
  if (context) {
    lines.push(context.title, context.url, `Published: ${context.publishedAt || "Not stated"} | Retrieved: ${context.retrievedAt}`, `Source text SHA-256: ${context.textHash}`,
      "This public source was attached for background review only. Applicability, effective status and any changes to internal policy require separate human review.");
    if (context.brief?.points?.length) {
      lines.push("Selected-passage AI notes — interpretation NOT independently validated:");
      for (const point of context.brief.points) lines.push(`- ${point.title}: ${point.summary}`, `  Page ${point.page ?? "?"}: ${point.quote || "No verified quotation"}`);
    }
  } else lines.push("No BNM source attached. This remains a fictional internal-policy test only.");
  lines.push("", "CHECK RESULTS");
  for (const finding of findings) {
    const decision = decisions[finding.id];
    lines.push(`${finding.id} | ${finding.title} | ${finding.status === "pass" ? "Meets demo criterion" : finding.status === "exception" ? "Exception flagged" : "Needs evidence review"}`,
      `Criteria: ${finding.criterion}`, `Condition: ${finding.condition}`,
      `Evidence: ${finding.evidence.lineId || "Not available"} | ${finding.evidence.quote || "No source-verified evidence"}`,
      `Value: ${finding.evidence.value || "Not available"} | ${finding.evidence.origin === "human" ? "Human corrected" : "AI proposed"} | Exact text match: ${finding.evidence.verified ? "yes (not semantic verification)" : "no"}`,
      `Follow-up: ${finding.nextStep}`, `Review disposition: ${decision?.status || "Pending"}`,
      `Review rationale: ${decision?.note?.trim() || "Not supplied"}`,
      "Cause: Not established. Effect / impact: Not assessed. No cause, loss or risk rating has been inferred.", "");
  }
  lines.push("TRACE & LIMITATIONS", `Model: ${extraction.model} | Extracted: ${extraction.createdAt} | Runtime: ${extraction.elapsedSeconds}s`,
    `Input SHA-256: ${extraction.inputHash}`, "Results are limited to these three rules and this packet. No sanctions, PEP, beneficial ownership, identity verification or transaction-monitoring checks were performed.",
    "Reviewer dispositions do not alter machine results. This is an editable local workpaper, not a signed, immutable or bank-approved audit record.",
    "", "SUPPLIED FICTIONAL PACKET", packet);
  return lines.join("\n");
}
