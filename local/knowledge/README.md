# Demo internal knowledge base

All three sample policies in `demo-internal-policies.json` are fictional interview fixtures, not BNM regulations or a real bank's controls.

The local read-only REST API and chat use the same versioned source provider:

- `GET /api/knowledge/documents` — catalog with versions and owners.
- `GET /api/knowledge/documents/demo-kyc` — current KYC policy as JSON.
- `GET /api/knowledge/documents/demo-kyc?version=1.0` — previous fictional version.
- `GET /api/knowledge/documents/demo-kyc?format=markdown` — human-readable sample document; save as `.md` if needed.
- `GET /api/knowledge/search?q=privileged%20access` — ranked source passages.

Every response includes the fictional label. Chat citations pin version and SHA-256; old citations never silently resolve to the current version. KYC v1/v2 intentionally differ in review frequency, exceptions and oversight so the interview can demonstrate version comparison. These dates and requirements are invented for the demo.

Production integration would replace the provider in `local/internal-knowledge.mjs` with an approved API/ingestion service and enforce user authentication, source-level authorization, document lifecycle and retention controls. The current loopback-only demo has no multi-user authorization or production internal connector. Chat uses bounded lexical retrieval and local Ollama via LangChain; no embeddings or external API credentials are required.
