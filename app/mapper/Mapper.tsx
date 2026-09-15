"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { readPolicy } from "./read-policy";
import { analysisErrorMessage, readConnection, unavailableConnection } from "./local-connection.mjs";

type Finding = {
  title: string;
  status: "covered" | "partial" | "gap" | "review";
  policyQuote: string;
  controlQuote: string;
  reason: string;
  nextStep: string;
  evidenceVerified: boolean;
};
type Report = {
  findings: Finding[];
  model: string;
  elapsedSeconds: number;
  createdAt: string;
  policyHash: string;
  controlsHash: string;
  warnings: string[];
};
type Connection = { ready: boolean; serverAvailable?: boolean; model: string; message: string };
const labels = {
  covered: "Covered on paper",
  partial: "Partial match",
  gap: "No matching control",
  review: "Needs verification",
};
const samplePolicy =
  "1. All employee accounts must use multi-factor authentication.\n\n2. Privileged access must be reviewed at least quarterly.\n\n3. Security incidents must be reported to the security team within 24 hours.";
const sampleControls =
  "C-01: Multi-factor authentication is enforced for all employee accounts.\n\nC-02: The IT manager reviews privileged access annually.\n\nC-03: Backups are completed every night.";

export default function Mapper() {
  const [policy, setPolicy] = useState("");
  const [controls, setControls] = useState("");
  const [names, setNames] = useState(["Pasted policy", "Pasted controls"]);
  const [connection, setConnection] = useState<Connection>({
    ready: false,
    model: "Ollama",
    message: "Checking local model…",
  });
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [gapsOnly, setGapsOnly] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const connectionAbort = useRef<AbortController | null>(null);
  const results = useRef<HTMLElement | null>(null);

  const checkConnection = useCallback(async () => {
    connectionAbort.current?.abort();
    const controller = new AbortController();
    connectionAbort.current = controller;
    try {
      const status = await readConnection(window.location.hostname, controller.signal);
      if (!controller.signal.aborted) setConnection(status);
    } catch {
      // A newer check or component teardown cancelled this request.
    }
  }, []);
  useEffect(() => {
    void checkConnection();
    const refresh = () => {
      if (!document.hidden) void checkConnection();
    };
    const timer = setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      connectionAbort.current?.abort();
      abort.current?.abort();
    };
  }, [checkConnection]);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [busy]);

  function edit(value: string, kind: "policy" | "controls") {
    (kind === "policy" ? setPolicy : setControls)(value);
    setReport(null);
    setError("");
    setNames((old) =>
      kind === "policy"
        ? ["Pasted policy", old[1]]
        : [old[0], "Pasted controls"],
    );
  }
  async function upload(file: File | undefined, kind: "policy" | "controls") {
    if (!file) return;
    setReading(true);
    setError("");
    try {
      if (file.size > 5 * 1024 * 1024)
        throw new Error("Choose a file smaller than 5 MB.");
      const text =
        kind === "controls" && /\.csv$/i.test(file.name)
          ? await file.text()
          : (await readPolicy(file)).text;
      if (!text.trim()) throw new Error("The file contains no readable text.");
      if (text.length > 4000)
        throw new Error(
          "This small local model works with short excerpts. Paste up to 4,000 characters from your document instead.",
        );
      edit(text, kind);
      setNames((old) =>
        kind === "policy" ? [file.name, old[1]] : [old[0], file.name],
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read the file.");
    } finally {
      setReading(false);
    }
  }
  async function analyze() {
    setBusy(true);
    setElapsed(0);
    setError("");
    setReport(null);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch("/api/local/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy, controls }),
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ||
            "Analysis failed. Check that Ollama is running and try again.",
        );
      setReport(body);
      setGapsOnly(false);
      setTimeout(
        () =>
          results.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        100,
      );
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "Analysis cancelled. Your inputs are still here."
          : analysisErrorMessage(e),
      );
      if (!controller.signal.aborted) {
        if (e instanceof TypeError) {
          connectionAbort.current?.abort();
          setConnection(unavailableConnection(window.location.hostname));
        }
        void checkConnection();
      }
    } finally {
      setBusy(false);
      abort.current = null;
    }
  }
  function exportReport() {
    if (!report) return;
    const file = new Blob(
      [
        JSON.stringify(
          {
            ...report,
            sources: { policy: names[0], controls: names[1] },
            disclaimer:
              "AI-generated comparison of supplied text only. Human review required; not an assessment of operating effectiveness.",
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(file);
    const a = document.createElement("a");
    a.href = url;
    a.download = "regulatory-radar-review.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const shown =
    report?.findings.filter((f) => !gapsOnly || f.status !== "covered") || [];
  const inputTooLong = policy.length > 4000 || controls.length > 4000;
  return (
    <div className="rr-local">
      <header className="rr-header">
        <div className="rr-brand">
          <span className="rr-mark">R</span>
          <strong>Regulatory Radar</strong>
          <span className="rr-divider" />
          <span>Policy checker</span>
        </div>
        <span className="rr-local-tag">LOCAL AI</span>
      </header>
      <main className="rr-main">
        <div className="rr-heading">
          <div>
            <h1>What’s missing from your controls?</h1>
            <p>
              Compare a short policy with what you currently do. Review the
              differences, with evidence.
            </p>
          </div>
          <button
            className="rr-text-button"
            disabled={busy || reading}
            onClick={() => {
              setPolicy(samplePolicy);
              setControls(sampleControls);
              setNames([
                "Sample policy (fictional)",
                "Sample controls (fictional)",
              ]);
              setReport(null);
              setError("");
            }}
          >
            Try sample inputs
          </button>
        </div>
        <div className="rr-inputs">
          {(["policy", "controls"] as const).map((kind, index) => (
            <section className="rr-input-panel" key={kind}>
              <div className="rr-panel-title">
                <h2>
                  <span>{index + 1}</span>
                  {kind === "policy" ? "What’s required" : "What’s in place"}
                </h2>
                <label
                  className={`rr-upload ${busy || reading ? "rr-disabled" : ""}`}
                >
                  Upload {kind === "policy" ? "policy" : "controls"}
                  <input
                    type="file"
                    aria-label={`Upload ${kind}`}
                    accept={
                      kind === "policy" ? ".pdf,.txt,.md" : ".pdf,.txt,.md,.csv"
                    }
                    disabled={busy || reading}
                    onChange={(e) => {
                      void upload(e.target.files?.[0], kind);
                      e.target.value = "";
                    }}
                  />
                </label>
              </div>
              <label className="rr-sr-only" htmlFor={`rr-${kind}`}>
                {kind === "policy" ? "Policy text" : "Controls text"}
              </label>
              <textarea
                id={`rr-${kind}`}
                value={kind === "policy" ? policy : controls}
                onChange={(e) => edit(e.target.value, kind)}
                disabled={busy || reading}
                aria-invalid={
                  (kind === "policy" ? policy : controls).length > 4000
                }
                placeholder={
                  kind === "policy"
                    ? "Paste a policy excerpt here.\n\nFor example: Privileged access must be reviewed at least quarterly."
                    : "Paste your existing controls here.\n\nFor example: The IT manager reviews privileged access annually."
                }
              />
              <div className="rr-input-meta">
                <span>
                  {names[index].startsWith("Pasted")
                    ? kind === "policy"
                      ? "PDF, TXT or Markdown"
                      : "PDF, TXT, Markdown or CSV"
                    : names[index]}
                </span>
                <span>
                  {(kind === "policy"
                    ? policy
                    : controls
                  ).length.toLocaleString()}{" "}
                  / 4,000
                </span>
              </div>
            </section>
          ))}
        </div>
        <div className="rr-action-row">
          <div className="rr-connection" role="status" aria-live="polite">
            <span
              className={`rr-status-light ${connection.ready ? "ready" : ""}`}
            />
            <div>
              <strong>
                {connection.ready
                  ? `${connection.model} · Ready`
                  : connection.serverAvailable === false
                    ? "Local app unavailable"
                    : "Local model not ready"}
              </strong>
              <p>
                {connection.ready
                  ? "Documents stay on this computer. Nothing is saved automatically."
                  : connection.message}
              </p>
            </div>
            {!connection.ready && (
              <button className="rr-text-button" onClick={checkConnection}>
                Recheck
              </button>
            )}
          </div>
          <div className="rr-run-actions">
            {busy && (
              <button
                className="rr-text-button"
                onClick={() => abort.current?.abort()}
              >
                Cancel
              </button>
            )}
            <button
              className="rr-analyze"
              disabled={
                !connection.ready ||
                !policy.trim() ||
                !controls.trim() ||
                inputTooLong ||
                busy ||
                reading
              }
              onClick={analyze}
            >
              {reading
                ? "Reading file…"
                : busy
                  ? "Analyzing…"
                  : "Analyze with local AI"}
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
        {busy && (
          <div className="rr-progress" role="status">
            <span className="rr-spinner" />
            <div>
              <strong>Ollama is comparing your documents · {elapsed}s</strong>
              <p>
                Local analysis can take a few minutes. The first run also loads
                the model into memory.
              </p>
            </div>
          </div>
        )}
        {(error || inputTooLong) && (
          <div className="rr-error" role="alert">
            {inputTooLong
              ? "Shorten each excerpt to 4,000 characters or fewer. Your pasted text has been kept in full."
              : error}
          </div>
        )}
        {report && (
          <section
            className="rr-results"
            ref={results}
            aria-label="Analysis results"
          >
            <div className="rr-results-heading">
              <div>
                <h2>Your review</h2>
                <p>
                  {report.findings.length} requirements identified ·{" "}
                  {report.findings.filter((f) => f.status !== "covered").length}{" "}
                  to review · {report.elapsedSeconds}s
                </p>
              </div>
              <button className="rr-secondary" onClick={exportReport}>
                Export results
              </button>
            </div>
            <p className="rr-caveat">
              AI draft, not a compliance verdict. “Covered” compares written
              controls only; it does not prove they operate effectively.
            </p>
            {report.warnings.map((warning, index) => (
              <p className="rr-warning" key={index}>
                {warning}
              </p>
            ))}
            <label className="rr-filter">
              <input
                type="checkbox"
                checked={gapsOnly}
                onChange={(e) => setGapsOnly(e.target.checked)}
              />{" "}
              Show only items to review
            </label>
            {shown.length === 0 && (
              <p className="rr-no-results">
                {report.findings.length
                  ? "No items in this filter. Turn it off to review the matched controls."
                  : "The model did not identify verifiable requirements. Try a more specific policy excerpt."}
              </p>
            )}
            {shown.map((finding, index) => (
              <article className="rr-finding" key={`${index}-${finding.title}`}>
                <div className="rr-finding-heading">
                  <h3>{finding.title}</h3>
                  <span className={`rr-badge ${finding.status}`}>
                    {labels[finding.status]}
                  </span>
                </div>
                <p className="rr-reason">{finding.reason}</p>
                <div className="rr-evidence">
                  <div>
                    <h4>Policy evidence</h4>
                    {finding.policyQuote ? (
                      <blockquote>{finding.policyQuote}</blockquote>
                    ) : (
                      <p className="rr-muted">
                        Could not verify the model’s policy quote.
                      </p>
                    )}
                  </div>
                  <div>
                    <h4>Control evidence</h4>
                    {finding.controlQuote ? (
                      <blockquote>{finding.controlQuote}</blockquote>
                    ) : (
                      <p className="rr-muted">
                        {finding.status === "gap"
                          ? "No matching control identified in the supplied text."
                          : "No verified control quote. Review the source."}
                      </p>
                    )}
                  </div>
                </div>
                {finding.nextStep && (
                  <p className="rr-next-step">
                    <strong>Suggested next step</strong> {finding.nextStep}
                  </p>
                )}
                <small className="rr-evidence-status">
                  {finding.evidenceVerified
                    ? "Displayed quotes verified against your inputs"
                    : "Evidence check incomplete — do not rely on this assessment"}
                </small>
              </article>
            ))}
          </section>
        )}
        <footer className="rr-footer">
          Ollama + LangChain · Short excerpts, up to 10 requirements per run ·
          Verify findings before use
        </footer>
      </main>
    </div>
  );
}
