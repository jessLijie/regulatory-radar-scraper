# Policy checker — simplified, real local AI

The former six-view prototype is replaced by a single-page **Regulatory Radar policy checker**. See the repository README for setup, limits, architecture and the interview demonstration.

Run `npm run local` and open http://127.0.0.1:5180. Ollama must have `qwen3:1.7b` downloaded. The hosted Sites URL cannot call your computer's local model.

Flow: input policy and controls → LangChain structured comparison through Ollama → schema and source-quote validation → review/export. There is no fixture response or lexical fallback. Sample input text is explicitly fictional and goes through the exact same model call as uploaded documents.

Removed from the active UI: sidebar, demo tour, review approvals, coverage score, version history, control catalog and comparison dashboard. No existing exported files or prior localStorage were deleted.
