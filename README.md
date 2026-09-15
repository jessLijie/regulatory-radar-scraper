# Regulatory Radar

## Current app: BNM publication monitor

**Purpose:** help readers notice relevant BNM updates and understand key points through a concise, source-backed AI brief. The local app has no generated review questions or note-entry workflow.

Run `npm run local:background` on Windows and open **http://127.0.0.1:5180/**. Stop/restart after backend changes using `npm run local:stop` then `npm run local:background`. Ollama remains the local AI provider; the separate hosted site is unchanged.

1. **Check BNM updates:** fetch the real Banking & Islamic Banking listing and check up to five previously opened document texts. The first scan establishes a baseline. Later scans flag newly discovered records, changed listings and changed text. No fabricated updates or scheduled scans.
2. **Choose a publication:** start with all topics, then select any combination of tags: AML, KYC, Cybersecurity & IT, Data & privacy, Governance, Operational risk, Payments, Consumer protection, Capital & liquidity, Credit & lending, Islamic banking, Climate & ESG, or Other topics. Tags are derived from title keywords, not exhaustive AI classification; AML does not automatically imply KYC. Existing saved items receive the current tags without a rescan. A publication may match multiple tags; selecting tags uses OR (any match). Counts follow publication-date and flagged-update filters. Flags refresh after each scan, not after reading an item.
3. **What changed:** inspect before/after extracted text at changed, added or removed page positions when two saved versions exist. The older snapshot is the previous distinct text retrieved by this app, not necessarily an official prior edition. Layout shifts can cause differences. Without earlier text, the screen states that no comparison is possible. Previous listing field values are not retained, so exact listing metadata comparisons are not claimed.
4. **Generate brief:** local LangChain/Ollama explains up to three selected passages of the current source. Each independent AI call returns a title and summary only; the server binds its original quotation and page rather than letting the model choose a citation. This prevents cross-passage citation selection errors, but does not verify interpretation. The brief does not compare versions or establish legal applicability.
5. **Export brief:** read, copy or download a plain-text brief with source/date/hash, key points and original quotations. No generated questions, notes to fill in, customer approval or audit opinion.

Source pages and public briefs retain the existing local cache. Version-3 cached summaries remain readable with their original provenance; old question fields are ignored in the UI and brief export. New runs save version-4 summary-only results. Mismatched source/brief hashes are rejected, and failed regeneration retains the previous brief. The former review-note helper is preserved for older code, but is not used by the active app.

Active UI: `local/RegulatoryDesk.tsx`, `local/regulatory-desk.css`; review/difference helpers: `local/radar-review.mjs`; existing fetching/AI: `local/radar-data.mjs`, `local/radar-ai.mjs`. Tests run with `npm test`.

### Ask Radar and the demo internal API

The bottom-right **Ask Radar** bubble opens a non-modal portrait chat panel. Drag its title area to move it within the viewport; focus that handle and use arrow keys for keyboard movement (Shift moves faster). **Reset position** restores the bottom-right position. Resize and minimise/reopen keep the window reachable. Browse the main page while it is open.

The header's **Open chat in new tab** button opens `/chat` as a full-page chat. It copies messages, citations, the unsent draft, selected source scope and selected publication using a one-time in-memory BroadcastChannel handoff. The random transfer token is removed from the URL on arrival; no conversation text is put in the URL, browser storage or server. Each tab then continues independently. Transfer is disabled during generation; blocked/unsupported transfers leave the original conversation intact. A direct `/chat` visit starts an empty chat. Refresh clears chat. The local model serves one task at a time across tabs. No conversation is saved in the source catalog or sent to a cloud model.

Chat can answer questions from saved BNM text and **three fictional internal policies**. Select all sources, demo policies, or the open BNM publication. Latest-publication and scan answers use recorded dates/counts; fictional version comparisons use exact sample text. Other questions use bounded keyword retrieval (up to four passages from two documents), LangChain and local Ollama. Named comparisons resolve documents before searching their text; missing named sources are not replaced by similar documents. Each AI point carries validated source IDs, rendered as visible citations by the server. Valid citations establish source identity, not correctness of interpretation. Missing source text requires opening the BNM publication first; no whole-site or live-web coverage is claimed.

For the interview, open **Demo documents & API** inside chat. It links to human-readable KYC, access and incident sample documents, the JSON catalog, and search API. Ask “What changed in our demo KYC policy?” to show the fictional v1/v2 comparison, then “Compare BNM e-KYC Board approval with our internal KYC policy.” after opening the BNM e-KYC document. These are document-text comparisons, not actual bank compliance findings.

Read-only endpoints and production integration limitations are documented in `local/knowledge/README.md`. The API and chat share `local/internal-knowledge.mjs`, backed by versioned JSON fixtures. This is a working local demonstration API, not an authenticated production bank knowledge base. No embeddings, RAGFlow service, external credentials or real bank records are used.

Verification: 45 local unit tests plus local TypeScript checking and client build. Optional `node tests/radar-chat-live.mjs` exercises real Ollama comparison and source-reference validation using the saved BNM e-KYC text. Focused comparisons retrieve a complete matching sentence rather than merging neighbouring duties. Human review of the model's interpretation is still required; a passing citation check does not prove regulatory accuracy.

### Earlier implementations

The following historical sections describe preserved experiments, not the current home page. Their source files were kept recoverable; no customer-file or checklist-comparison navigation appears in the active monitor. The standalone `/mapper` route remains available separately.

## Archived: KYC file review experiment

The local home page has two connected workspaces: **BNM updates** and **KYC file review**. The scraper is real; the customer packet and three internal-policy criteria are explicitly fictional. Attaching a BNM publication supplies background context, **not legal authority for the demo rules**. No BNM change activates a rule automatically.

### A short interview walkthrough

1. Open **BNM updates**, check the real publication listing, open a source and generate its evidence-linked AI brief. Choose **Attach to KYC workpaper**. Repeating the scan demonstrates deduplication, not a manufactured "new regulation".
2. In **KYC file review**, expand and approve the three fictional criteria. Keep the explicit review date, 14 September 2026, for the reproducible example.
3. Click **Extract facts with local AI**. LangChain + local Ollama extracts a company registration reference, identity expiry date and address-proof issue date with source-line IDs. Results are generated from the current input, not sample answers.
4. Review the three extracted values against their source lines. Correct a value or source line if needed, then confirm the evidence and **Run 3 policy checks**.
5. The original packet should produce two criteria met and one address-age exception: 166 calendar days against the fictional 90-day limit. Expand the findings, record your disposition and rationale, and open the readable workpaper. It remains **Draft** until all findings have a disposition, flagged items have reasons and a reviewer label is supplied.
6. Click **Edit file → Updated address proof**. This changes the fictional input date to 1 September 2026, clears prior results, and requires extraction and review again. The date calculation should now meet that criterion. No compliant-customer decision is made.

The finished output is a printable/copyable/downloadable text workpaper with objective, scope, criteria, condition, source evidence, follow-up, reviewer dispositions, input hash and model metadata. It explicitly leaves cause and impact unassessed. It is not a signed, immutable or bank-approved audit record.

### What is automated, and what is not

- **Data pipeline:** the existing BNM fetcher, parsing, source snapshots and change detection remain intact.
- **AI:** structured, source-linked extraction from one short fictional text packet. The model does not calculate date differences, grade customer risk or approve the customer. Exact substring matching verifies copied text, not interpretation.
- **Deterministic checks:** presence of a usable registration reference, identity expiry against the explicit review date, and address-proof age in calendar days. Expiry on the review date and address age exactly 90 days meet the fictional criteria. Missing, future-dated, unsupported or unverified evidence stays unresolved.
- **Human review:** approve the fixed demonstration policy; check and correct AI facts; confirm/dismiss flags with reasons. Dismissal retains the original machine result. The reviewer label is not authenticated.
- **Output:** a readable workpaper with optional BNM source/brief provenance. No email sending, recurring scan, customer screening, bank integration or production approval workflow is implemented.

Text-only packets are limited to one company/person, 6,000 characters, 40 lines and 9,000 UTF-8 bytes. No OCR, multiple-customer batch processing, sanctions/PEP checks, beneficial ownership checks or document authentication. Oversized input is rejected, not silently truncated. Use synthetic data only.

Switching between the two workspace tabs preserves the current case in browser memory. Editing packet text, facts, review date or policy approval clears affected downstream results and dispositions. Nothing from the KYC packet is automatically persisted or sent to external AI. Refreshing loses the case; export explicitly first. Public BNM data retains the existing local persistence described below.

Code: `local/AuditApp.tsx` (workspace navigation), `local/KycDesk.tsx` and `local/kyc.css` (case/review UI), `local/kyc-ai.mjs` (real local extraction), `local/kyc-rules.mjs` (fixed fictional rules, evidence checks and workpaper), `tests/kyc.test.mjs` (rule/date/provenance/review regression tests).

The browser walkthrough was checked with the real `qwen3:1.7b` model: the original file extracted in 18 seconds and the updated file in 10 seconds, producing the expected input-dependent exception/pass. Timings and model output vary. The combined local suite has 26 unit tests plus TypeScript and build checks. Run `npm run test:kyc:live` with the local app running to repeat the two real-model cases. This is a tiny smoke test, not an accuracy benchmark. Print and download controls are provided; the embedded browser's filesystem/printer completion is not independently verified, so the visible workpaper and copy option remain available.

## Archived: earlier regulatory reading desk

Run `npm run local:background` on Windows, then open **http://127.0.0.1:5180/**. To restart after code changes: `npm run local:stop`, then `npm run local:background`. On other platforms use `npm run local` and keep its terminal open. Requires the existing Ollama installation and downloaded `qwen3:1.7b` model (setup below).

The **BNM updates** workspace retains the reading desk:

1. **Check BNM updates** collects the real Banking & Islamic Banking publication listing. The first scan establishes a baseline, not a list of newly published regulations.
2. Choose a publication. The server downloads the original PDF or supported publication page and extracts its text with page references.
3. **Generate AI brief** uses LangChain + local Ollama to explain up to three evidence-linked observations and human review questions.
4. **Checklist comparison** puts selected source passages beside AI-suggested entries in an editable, clearly fictional sample checklist and generates review questions. It does not grade control coverage, assess an actual bank or approve a customer.
5. **Export review** opens a JSON preview with source URL/hash/time, the AI brief and any comparison. Download or copy it; if your embedded browser blocks downloads or clipboard access, the preview can be selected manually. Checklist text is included only when explicitly exporting a comparison.

### Honest scope and change detection

- Primary source: `https://www.bnm.gov.my/banking-islamic-banking`. The older hosted scraper still supports the other original sources. They are not silently presented as monitored sources in this local version.
- Publication date comes from the date column, never an FAQ update date elsewhere in the row. Discovery date is separate. Document effective dates and applicability must be checked in the source; the app does not infer legal deadlines.
- A normalized listing fingerprint detects changes to titles, dates, types, related links and listing text. Canonical BNM document URLs identify records. Unchanged records are not duplicated or announced as new.
- Scans also re-fetch **up to five most recently opened documents**, compare normalized extracted text, and preserve the current and immediately preceding different text version. Other documents and related attachments receive listing checks only. The UI reports the scan coverage and failures.
- PDF layout changes can affect page-position comparisons. A detected text/listing change is not automatically a substantive regulatory amendment. No earlier version means no before/after claim.
- No-content/error pages must not erase the saved catalog. Failed full-text checks are reported as partial coverage rather than a clean "no changes" result.
- The AML/KYC list filter uses title keywords. It is explicitly not an AI classification or exhaustive relevance assessment. All topics remain accessible.

### AI, privacy and limits

- Briefs use at most five rule-selected passages (6,500-character context budget). Comparisons select up to three short mandatory sentence excerpts from BNM's numbered standards, with a bounded-passage fallback for other layouts, and accept a checklist of up to 4,000 characters. Surrounding qualifications and later sentences still require human review. Both explicitly disclose selected-passage coverage, not full-document assurance. This is lightweight passage retrieval, not a vector/RAGFlow implementation.
- The model returns structured observations and source/control IDs. The application resolves those IDs and attaches the original passage and checklist text itself; the model cannot invent a quotation. Unknown or inconsistent references cause the related interpretation to be withheld. Correct evidence references do not establish semantic accuracy, legal applicability or completeness.
- Each comparison runs one requirement at a time and suggests one checklist entry, or no match. It does not combine evidence across multiple controls or decide whether a requirement is satisfied. Match explanations are deliberately neutral application text; the local model supplies the suggested entry, requirement title and review question. Verify every suggestion, especially with the small 1.7B model.
- Draft/discussion/feedback publication types cannot be treated as final requirements in the comparison. Older publications may have been superseded; always verify the original source.
- Public documents and public-source AI briefs are persisted locally in Git-ignored `.radar-data/catalog.json` using atomic replacement. Checklist text and comparisons remain in memory unless exported. Refreshing clears the checklist edits and comparison.
- Source requests and every redirect are limited to HTTPS on `www.bnm.gov.my` / `bnm.gov.my`. No scraping relay, remote AI, browser automation, cloud tracing, external account or bank integration is used by the new local app.
- Downloads are limited to 15 MB, 220 PDF pages and 1.2 million extracted characters. Scanned/image-only PDFs are rejected; no fake fallback. One action runs at a time with cancellation and a five-minute overall timeout. Public fetching has a per-request timeout.
- `npm run local:stop` stops the hidden web app, not Ollama. Nothing is installed as a Windows startup service.

### Interview demo

Use the real **Electronic Know-Your-Customer (e-KYC)** publication in the AML/KYC list. Generate its brief, inspect a quote in the source reader, then compare the fictional checklist. Edit a control and rerun to show a genuine input-dependent result. Repeat the BNM scan to demonstrate deduplication. Do not claim a new BNM publication appeared today if none did. No synthetic regulation or prewritten AI result is injected into the live feed.

Relevant code: `local/Radar.tsx` and `local/radar.css` (UI), `local/radar-data.mjs` (fetching/parsing/snapshots), `local/radar-ai.mjs` (brief/checklist orchestration), `local/analysis.mjs` (local model/grounding), `local/server.mjs` (loopback API). `npm test` runs unit tests, local typechecking and the client build.

### Verification on this laptop

On 14 September 2026 (Malaysia time), the live listing produced 147 publications. A repeated scan reported zero new/changed listings, checked the previously opened e-KYC document's text, and produced no duplicates or fetch errors. The real 30-page e-KYC source produced a three-point brief in 49 seconds and a three-question checklist review in 24 seconds with `qwen3:1.7b`. Timings and model suggestions vary.

`npm test` passes 16 unit tests, TypeScript checking and the production client build. Date filters (including invalid ranges), source-page selection, desktop/mobile overflow, saved-catalog persistence, local-only API restrictions and export-preview rendering were checked. The embedded browser did not provide a verifiable file-download receipt, so file saving is not claimed as tested; use the visible export text if necessary. This is an interview demo, not a validated compliance engine or a production banking deployment.

## Standalone local AI policy checker

Still available at **http://127.0.0.1:5180/mapper**: paste/upload a short policy, paste/upload controls, click **Analyze with local AI**, then review the quoted evidence and export the results. Uses real **LangChain + Ollama** inference. No API key, canned results, keyword-classification fallback, accounts or database.

### Run

Install [Ollama](https://ollama.com/download) and Node.js 22.13+ (Node 24 recommended). Once per computer:

```sh
ollama pull qwen3:1.7b
npm ci
```

Then start the app from this repository:

```sh
npm run local
```

Open **http://127.0.0.1:5180**. On Windows the app starts the standard installed Ollama executable automatically if needed. Otherwise open Ollama manually. Click **Recheck** if you started/downloaded the model after opening the page. Keep the terminal running; Ctrl+C stops the app. The model download is about 1.4 GB, in addition to the Ollama installation.

**Windows: keep the app running after closing the terminal** (recommended for demos):

```sh
npm run local:background
```

This builds the UI and starts a hidden local process. It does not install a service or start automatically at Windows login. After restarting the computer, run the command again. Stop it with `npm run local:stop`; Ollama is left unchanged. Runtime/error logs are in the Git-ignored `.local-runtime` folder; no document text is logged. Stop the background app before switching to `npm run local` or `npm run local:dev`. After backend code changes, stop it and start again.

If the page loses its connection, it keeps your inputs, disables analysis and offers **Recheck** with startup instructions. Status refreshes every 10 seconds while the tab is visible and when you return to it. A stopped local server is shown separately from a running server whose model is unavailable; neither falls back to sample output.

Click **Try sample inputs → Analyze with local AI** for a three-requirement comparison. Sample inputs are fictional; the results are freshly generated by the local model. Change “annually” to “quarterly” in the control text and rerun to demonstrate a genuine input-dependent assessment. Check all quotes and judgments yourself.

Optional: select a different downloaded local model with the `OLLAMA_MODEL` environment variable before starting. Cloud-backed models are rejected. Larger models may need more memory. The default is `qwen3:1.7b` with thinking disabled and an 8K context, selected for a laptop with 16 GB RAM and 2 GB GPU memory. A larger model can improve quality but must be evaluated, not assumed accurate.

### Scope and privacy

- Standalone AI checker: **http://127.0.0.1:5180/mapper** (not the hosted Sites URL). The main `/` reading desk combines BNM fetching with local AI; the standalone checker still accepts only supplied excerpts.
- The existing BNM scraper is preserved in the main hosted app. `npm run dev` still runs that separate Vinext application; it is not the local AI backend.
- Browser extracts text from PDF/TXT/Markdown; controls also accept CSV as text. The local Node backend passes both short excerpts to LangChain's `ChatOllama.withStructuredOutput`, then verifies quote substrings and produces input SHA-256 hashes. No vector store or RAGFlow required for this small-document workflow; this is structured document comparison, not a full RAG system.
- Documents and results remain in process/browser memory, except when you explicitly export results. No localStorage, automatic document files, telemetry or remote tracing is added. Refreshing clears the inputs. Model files remain installed locally.
- Backend and Ollama bind to loopback. API rejects foreign origins/hosts and cloud-backed model metadata; LangSmith tracing is disabled. Model outputs are rendered as text, not executable HTML. No tools are given to the model.
- Use synthetic or approved, non-sensitive material for an interview. This personal local app is not a bank-approved production system.

### Limits

Short excerpts only: 4,000 characters per input, combined UTF-8 context budget of 9,600 bytes, at most 10 identified requirements per run. Longer documents are rejected rather than silently truncated. Text-based PDFs only; scanned PDFs need OCR elsewhere. CSV is passed as source text, not loaded into a database.

The model can miss requirements, misread frequency/scope, or hallucinate. Source checking confirms quotes, **not semantic correctness or completeness**. Unverified assessments are replaced with “Needs verification.” “Covered on paper” is not a compliance conclusion or evidence of operating effectiveness. Human review is always required.

Only one analysis runs at a time. Cancel disconnects and aborts local inference; runs time out after five minutes. Offline/model/schema errors show real failures, never demo data. Local CPU inference can take several minutes, especially on first load.

### Code and checks

- `app/mapper/Mapper.tsx`: simple React UI, inputs, analysis, evidence and JSON export.
- `app/mapper/read-policy.ts`: browser PDF/text extraction.
- `local/server.mjs`: loopback-only HTTP API and built app, request validation/cancellation.
- `local/analysis.mjs`: LangChain prompt, Ollama model, structured schema and quote checks.
- `tests/local-analysis.test.mjs`: validation and evidence-grounding tests.

```sh
npm run test:local
npm run build:local
```

`npm test` runs all three local checks (unit tests, local TypeScript check and build). With the app and model running, `npm run test:local:live` makes two actual model calls and checks that changing an annual review to quarterly changes the assessment. It is a small smoke test, not an accuracy benchmark.

Verified on this Windows laptop on 2026-09-12: the real model returned covered / partial / gap for the three sample requirements; changing the annual review to quarterly changed that finding to covered. All returned evidence passed source checks. First run: 108 seconds including model startup; warm rerun: 24 seconds. Timing and output may vary. PDF/CSV import, oversized pasted text, cancellation, local-access restrictions and production PDF worker loading were also checked.

`npm run local` builds and serves static assets with a restrictive CSP; it does not expose a development server or source files. For hot-reload development, use `npm run local:dev` instead (same port; do not run both simultaneously). The shared hosted/Sites stack retains its original dependencies and is not part of this local app's production-readiness claim.

The earlier six-screen fixture-driven prototype was removed from the active code; it remains recoverable in Git history. The hosted production deployment is not automatically changed by local development.

## Original hosted application

The following notes describe the separate Vinext / Sites scraper application.

A clean full-stack starter running on
[vinext](https://github.com/cloudflare/vinext), with optional Cloudflare D1 and
Drizzle support.

## Prerequisites

- Node.js `>=22.13.0`

## Quick Start

```bash
npm install
npm run dev
npm run build
```

This starter does not use `wrangler.jsonc`.

## Included Shape

- edit site code under `app/`
- `.openai/hosting.json` declares optional Sites D1 and R2 bindings
- `vite.config.ts` simulates declared bindings for local development
- `db/schema.ts` starts intentionally empty
- `examples/d1/` contains an optional D1 example surface
- `drizzle.config.ts` supports local migration generation when needed

## Workspace Auth Headers

Signed-in visitors receive both `oai-authenticated-user-id` and `oai-authenticated-user-email`. Private Sites require every visitor to sign in; public Sites may also have anonymous visitors, for whom neither header is present.

The user ID is stable for the same user on the same Site and different across Sites. Email and name are intended for display or contact purposes.

SIWC-authenticated workspace sites may also receive
`oai-authenticated-user-full-name` when the user's SIWC profile has a non-empty
`name` claim. The full-name value is percent-encoded UTF-8 and is accompanied by
`oai-authenticated-user-full-name-encoding: percent-encoded-utf-8`.

Treat the full name as optional and fall back to email when it is absent:

```tsx
import { headers } from "next/headers";

export default async function Home() {
  const requestHeaders = await headers();
  const userId = requestHeaders.get("oai-authenticated-user-id");
  const email = requestHeaders.get("oai-authenticated-user-email");
  const encodedFullName = requestHeaders.get("oai-authenticated-user-full-name");
  const fullName =
    encodedFullName &&
    requestHeaders.get("oai-authenticated-user-full-name-encoding") ===
      "percent-encoded-utf-8"
      ? decodeURIComponent(encodedFullName)
      : null;

  const displayName = fullName ?? email;
  // ...
}
```

## Optional Dispatch-Owned ChatGPT Sign-In

Import the ready-to-use helpers from `app/chatgpt-auth.ts` when the site needs
optional or required ChatGPT sign-in:

- Use `getChatGPTUser()` for optional signed-in UI.
- Use `requireChatGPTUser(returnTo)` for server-rendered pages that should send
  anonymous visitors through Sign in with ChatGPT.
- Use `chatGPTSignInPath(returnTo)` and `chatGPTSignOutPath(returnTo)` for
  browser links or actions.
- Pass a same-origin relative `returnTo` path for the destination after sign-in
  or sign-out. The helper validates and safely encodes it.
- Mark protected pages with `export const dynamic = "force-dynamic"` because
  they depend on per-request identity headers.

Dispatch owns `/signin-with-chatgpt`, `/signout-with-chatgpt`, `/callback`, the
OAuth cookies, and identity header injection. Do not implement app routes for
those reserved paths. Routes that do not import and call the helper remain
anonymous-compatible.

SIWC establishes identity only; it does not prove workspace membership. Use the
Sites hosting platform's access policy controls for workspace-wide restrictions,
or enforce explicit server-side membership or allowlist checks.

Use SIWC for account pages, user-specific dashboards, saved records, and write
actions tied to the current ChatGPT user. Leave public content anonymous.

## Useful Commands

- `npm run dev`: start local development
- `npm run build`: verify the vinext build output
- `npm test`: build the starter and verify its rendered loading skeleton
- `npm run db:generate`: generate Drizzle migrations after schema changes

## Learn More

- [vinext Documentation](https://github.com/cloudflare/vinext)
- [Drizzle D1 Guide](https://orm.drizzle.team/docs/get-started/d1-new)
