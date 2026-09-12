# Control Match Lab prototype

Open `/mapper`. The existing on-demand BNM scraper remains at `/`.

## Run locally

Use Node.js 24 or later. Run `npm ci`, then `npm run dev`; open `/mapper` on the printed local URL. `npm run build` builds the existing Cloudflare Worker application. `npm run test:mapper` runs the domain checks.

## Implemented

- Reproducible synthetic policy: 20 requirements, 50 controls, authored baseline of 10 full / 5 partial / 5 no-match suggestions.
- Side-by-side source passages, requirement search, status filters, full control selector, relationship overrides, review notes, approval and rejection.
- Approved coverage derived only from current, approved full mappings. Partial and rejected mappings never increase full coverage.
- Browser-local persistence with a visible storage-failure state, CSV mapping export and JSON evidence export.
- Version comparison: stable requirement IDs when supplied, exact-text matching, and explicitly labelled heuristic alignment otherwise. Changed requirements lose their current decision; identical requirements with unchanged controls may carry forward. Prior versions, evidence and decisions are retained in exported history snapshots.
- Real text-based PDF parsing via Mozilla PDF.js, TXT/Markdown parsing, and CSV imports. Policy files remain in the browser; text and decisions are stored in localStorage.
- SHA-256 raw-file and normalized-text identities detect exact duplicates and text-identical revisions.
- Responsive layout, keyboard-accessible forms and native modal dialogs.

## Deliberate prototype limits

There is **no live AI provider, LangChain service, RAGFlow instance, n8n workflow, shared database or notification delivery configured**. Authored sample explanations are labelled as illustrative. Imported documents use a transparent local fallback: extract sentences containing must/shall/required-to, tokenize, rank by cosine-like lexical overlap, and propose only `related` or `unmapped`. It never infers full sufficiency from matching words. Candidate requirements can contain multiple obligations or omit requirements expressed differently; review the source before interpreting coverage. The UI supports one control per requirement, not many-to-many mappings.

Limits: PDF/TXT/Markdown policy up to 5 MB and 60 PDF pages; control CSV up to 2 MB and 200 rows; up to 100 extracted requirement candidates. Scanned PDF OCR is not implemented. CSV needs `id,title,description`, with optional `domain,owner`. Duplicate control IDs are rejected. Prefix policy sentences with unique `REQ-123:` IDs for deterministic version alignment.

The review history is a local demonstration record, not tamper-evident storage or an authenticated approval workflow. This workbench is not automatically connected to the scraper’s results. Source buttons show retained passages, not a rendered PDF page. Built-in labels are synthetic test expectations, not independently measured model accuracy. Full document coverage is distinct from control operating effectiveness.

## Five-minute interview demo

1. Use Reset demo to load v1.0. Run demo mapping to replay the authored scenario.
2. Review REQ-001: quarterly requirement versus annual control. Approve partial; coverage stays 0%.
3. Review REQ-002: privileged MFA. Approve full; coverage becomes 5%.
4. Approve unchanged REQ-005 as full. Coverage becomes 10%.
5. Open Policy changes and load sample v2.0. It has three modified, one added and one removed requirement. The MFA scope expands, invalidating REQ-002’s approval. REQ-005 carries forward; coverage returns to 5%.
6. Open Coverage matrix and export CSV. Export the JSON evidence packet to inspect previous-version snapshots and review history.
7. Import `tests/fixtures/policy-v1.txt` and `tests/fixtures/controls.csv` to show the working ingestion pipeline. Explain the conservative fallback and where live AI would be plugged in.

## Live integration boundary

Keep the browser review UI. Move ingestion, source versions and decision storage behind an authenticated backend. A LangChain service should extract discrete requirements into the `Requirement` schema and evaluate candidate pairs against a rubric. RAGFlow should provide candidate controls and mechanically resolvable source spans. Replace `lexicalMapping()` with a server request returning validated `Proposal[]`, rejecting unknown requirement/control IDs and unsupported citations. Persist provider/model/prompt versions on each run. n8n can orchestrate ingestion completion and notifications from durable server events, after explicit workflow configuration. Do not place provider secrets or webhook credentials in the browser.

Evaluate against an independently reviewed golden set, measuring extraction recall, retrieval recall@k, pair classification precision/recall, citation validity and reviewer override rates. Never use authored fixture replay as evidence of model performance.

## Verification

Domain tests cover label counts, approval-only coverage, stale evidence, version deltas, quoted/multiline CSV, duplicate validation, conservative imported matching and CSV formula neutralization. Browser QA covers review decisions, version impact, file import and responsive behavior. The production build includes both the existing scraper and `/mapper`.
