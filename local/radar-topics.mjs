// Suggested navigation tags, not legal classifications or AI judgments.
// Only explicit title terms are used; never infer KYC merely from an AML label.
export const TOPICS = [
  { id: "aml", label: "AML", pattern: /\baml\b|anti[\s-]?money|launder|financing of terrorism|proliferation financing|financial sanctions/i },
  { id: "kyc", label: "KYC", pattern: /\bkyc\b|know[\s-]?your[\s-]?customer|customer due diligence|\bcdd\b|\bedd\b|customer identit|customer verification/i },
  { id: "technology", label: "Cybersecurity & IT", pattern: /cyber|risk management in technology|\brmit\b|information security|internet banking|e-banking|artificial intelligence|financial technology|digital bank|open finance|tokenisation/i },
  { id: "data", label: "Data & privacy", pattern: /customer information|data (?:management|protection|privacy)|permitted disclosures|open finance|\bmis framework\b/i },
  { id: "governance", label: "Governance", pattern: /governance|compliance|external auditor|fit and proper|responsibility mapping|shareholder suitability|related part|connected part|employee screening|financial reporting/i },
  { id: "operations", label: "Operational risk", pattern: /operational risk|operational resilience|business continuity|outsourcing|recovery planning/i },
  { id: "payments", label: "Payments", pattern: /payment|fund transfer|\brentas\b|e-money|electronic money|(?:credit|debit|charge) card|money services business/i },
  { id: "consumer", label: "Consumer protection", pattern: /consumer|fair treatment|complaints|ombudsman|product transparency|prohibited business conduct|basic banking|financial inclusion|unauthorised.*transactions/i },
  { id: "capital", label: "Capital & liquidity", pattern: /capital|liquidity|leverage ratio|stable funding|statutory reserve|basel|systemically important|stress testing|standing facilities/i },
  { id: "credit", label: "Credit & lending", pattern: /credit|lending|loans?|personal financing|pembiayaan|large exposures|exposure limit|counterparty|securitisation|interest rate risk|reference rate|risk-informed pricing/i },
  { id: "islamic", label: "Islamic banking", pattern: /islamic|shariah|takaful|sukuk|myor-i|card-i|\bislam\b|tawarruq|rahn|hajah|darurah|kafalah|wa['’]d|ijarah|hibah|qard|wadiah|wakalah|istisna|mudarabah|musyarakah|murabahah|ibra['’]?|bai.*sarf|value-based intermediation/i },
  { id: "climate", label: "Climate & ESG", pattern: /climate|\besg\b|sustainab|value-based intermediation/i },
  { id: "other", label: "Other topics", pattern: null },
];

export function publicationTags(title) {
  const text = String(title || "").normalize("NFKC").replace(/[‐‑‒–—]/g, "-");
  const tags = TOPICS.filter((topic) => topic.pattern?.test(text)).map((topic) => topic.id);
  return tags.length ? tags : ["other"];
}

export function matchesTopics(tags, selected) {
  return selected.length === 0 || selected.some((id) => tags.includes(id));
}

export function topicLabel(id) {
  return TOPICS.find((topic) => topic.id === id)?.label || "Other topics";
}
