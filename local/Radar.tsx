import { useCallback, useEffect, useRef, useState } from "react";
import { readConnection } from "../app/mapper/local-connection.mjs";
import type { RegulatoryContext } from "./KycDesk";

type Publication = {
  id: string;
  title: string;
  url: string;
  publishedAt: string;
  type: string;
  topic: string;
  change: string;
  firstSeenAt: string;
  available: boolean;
  attachments: { title: string; url: string }[];
};
type Scan = {
  at: string;
  baseline: boolean;
  count: number;
  newCount: number;
  changedCount: number;
  relevantCount: number;
  documentsChecked: number;
  documentsTracked: number;
  errors: string[];
};
type Catalog = {
  items: Publication[];
  lastScan: Scan | null;
  sourceUrl: string;
};
type Passage = { id: string; page: number; text: string };
type Brief = {
  points: {
    title: string;
    summary: string;
    question: string;
    quote: string;
    page: number | null;
    verified: boolean;
  }[];
  createdAt: string;
  model: string;
  elapsedSeconds: number;
  textHash: string;
  sourceIds: string[];
};
type Document = {
  item: Publication;
  url: string;
  pageCount: number;
  format: string;
  textHash: string;
  retrievedAt: string;
  checkedAt: string;
  pages: { number: number; text: string }[];
  sections: Passage[];
  selectedSections: Passage[];
  brief: Brief | null;
  previous: { retrievedAt: string } | null;
  changedPages: number[];
  removedPages: number[];
};
type Report = {
  findings: {
    title: string;
    status: string;
    policyQuote: string;
    controlQuote: string;
    reason: string;
    nextStep: string;
    page: number | null;
    evidenceVerified: boolean;
  }[];
  warnings: string[];
  elapsedSeconds: number;
  passagesReviewed: number;
  model: string;
};
const initialChecklist =
  "C-01: Customers submit a photograph of their identity document during online onboarding.\n\nC-02: Cases that fail automated identity verification are sent to a trained officer for manual review.\n\nC-03: The compliance team documents its customer risk assessment.\n\nC-04: Customer onboarding records are stored in an access-controlled system.";
const date = (value: string | null | undefined) =>
  value
    ? new Date(
        value.length === 10 ? `${value}T00:00:00` : value,
      ).toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Not stated";
const stamp = (value: string) =>
  new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const changeNames: Record<string, string> = {
  new: "New to radar",
  listing: "Listing updated",
  document: "Text changed",
  unlisted: "No longer listed",
};
const statusNames: Record<string, string> = {
  covered: "Addressed in text",
  partial: "Partly addressed",
  candidate: "Suggested match · needs review",
  gap: "No match suggested",
  review: "Needs verification",
};

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}
function Download({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button className="rd-button secondary" onClick={onClick}>
      {children} <span aria-hidden="true">↓</span>
    </button>
  );
}

export default function Radar({ onAttachContext }: { onAttachContext?: (source: RegulatoryContext) => void }) {
  const [catalog, setCatalog] = useState<Catalog>({
    items: [],
    lastScan: null,
    sourceUrl: "https://www.bnm.gov.my/banking-islamic-banking",
  });
  const [loading, setLoading] = useState(true);
  const [connection, setConnection] = useState<{
    ready: boolean;
    serverAvailable?: boolean;
    model: string;
    message: string;
  }>({ ready: false, model: "Ollama", message: "Checking local AI…" });
  const [topic, setTopic] = useState("aml");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Publication | null>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [checklist, setChecklist] = useState(initialChecklist);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [step, setStep] = useState("brief");
  const [page, setPage] = useState(1);
  const [showSource, setShowSource] = useState(false);
  const [exportText, setExportText] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const exportDialog = useRef<HTMLDialogElement | null>(null);
  const actionAbort = useRef<AbortController | null>(null);
  const healthAbort = useRef<AbortController | null>(null);
  const panel = useRef<HTMLElement | null>(null);
  const sourcePanel = useRef<HTMLDetailsElement | null>(null);
  useEffect(() => {
    if (exportText) exportDialog.current?.showModal();
  }, [exportText]);

  const checkHealth = useCallback(async () => {
    healthAbort.current?.abort();
    const controller = new AbortController();
    healthAbort.current = controller;
    try {
      const current = await readConnection(
        window.location.hostname,
        controller.signal,
      );
      if (!controller.signal.aborted) setConnection(current);
    } catch {
      /* Superseded check. */
    }
  }, []);
  async function loadCatalog() {
    const response = await fetch("/api/radar/catalog", {
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok)
      throw new Error(
        "Could not load saved publications. Restart the local app and try again.",
      );
    const data = await response.json();
    setCatalog(data);
    return data as Catalog;
  }
  useEffect(() => {
    void loadCatalog()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
    void checkHealth();
    const refresh = () => {
      if (!document.hidden) void checkHealth();
    };
    const timer = setInterval(refresh, 10_000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      healthAbort.current?.abort();
      actionAbort.current?.abort();
    };
  }, [checkHealth]);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now();
    setElapsed(0);
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [busy]);
  async function task(
    label: string,
    endpoint: string,
    body: object,
    done: (data: any) => void | Promise<void>,
  ) {
    setBusy(label);
    setError("");
    setNotice("");
    const controller = new AbortController();
    actionAbort.current = controller;
    try {
      const response = await fetch(`/api/radar/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "This task could not be completed.");
      if (!controller.signal.aborted) await done(data);
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "Task cancelled. You can try again; your checklist is still here."
          : e instanceof TypeError
            ? "The local app is unreachable. Run npm run local:background and try again. Your checklist is still here."
            : e instanceof Error
              ? e.message
              : "Something went wrong. Please retry.",
      );
      void checkHealth();
    } finally {
      setBusy("");
      actionAbort.current = null;
    }
  }
  function scan() {
    void task(
      "Checking BNM publications",
      "scan",
      {},
      async (data: Catalog) => {
        setCatalog(data);
        const result = data.lastScan!;
        setNotice(
          result.baseline
            ? `First check complete. ${result.count} publications saved as your starting point—not newly published today.`
            : result.errors.length
              ? `Check partially complete. ${result.newCount} newly discovered · ${result.changedCount} changed. Some documents could not be checked.`
              : `${result.newCount} newly discovered · ${result.changedCount} changed. ${result.relevantCount ? `${result.relevantCount} AML/KYC items need a look.` : "No new AML/KYC changes detected in the checked sources."}`,
        );
        if (doc) {
          setDoc(null);
          setBrief(null);
          setReport(null);
          setSelected(null);
        }
      },
    );
  }
  function open(item: Publication) {
    setSelected(item);
    setDoc(null);
    setBrief(null);
    setReport(null);
    setStep("brief");
    setPage(1);
    setShowSource(false);
    if (window.innerWidth < 850)
      setTimeout(
        () => panel.current?.scrollIntoView({ behavior: "smooth" }),
        50,
      );
    void task(
      "Reading the source document",
      "document",
      { id: item.id },
      async (data: Document) => {
        setDoc(data);
        setBrief(data.brief);
        await loadCatalog();
      },
    );
  }
  function evidence(pageNumber: number | null) {
    if (!pageNumber) return;
    setPage(pageNumber);
    setShowSource(true);
    setTimeout(
      () =>
        sourcePanel.current?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        }),
      50,
    );
  }
  function download() {
    if (!doc) return;
    const payload = {
      title: doc.item.title,
      sourceUrl: doc.url,
      publishedAt: doc.item.publishedAt,
      sourceHash: doc.textHash,
      sourceCheckedAt: doc.checkedAt,
      brief,
      comparison: report,
      checklist: report ? checklist : undefined,
      disclaimer:
        "AI-assisted review of selected passages. Checklist is a demonstration or user-edited input, not an actual bank policy. Human verification required.",
    };
    setExportNotice("");
    setExportText(JSON.stringify(payload, null, 2));
  }
  function saveExport() {
    const url = URL.createObjectURL(
      new Blob([exportText], {
        type: "application/json",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "regulatory-radar-review.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportNotice(
      "Download requested. If your browser does not save it, use Copy JSON or select the text below.",
    );
  }
  const filtered = catalog.items.filter(
    (item) =>
      (topic === "all" || item.topic === "AML / KYC") &&
      (!from || item.publishedAt >= from) &&
      (!to || item.publishedAt <= to),
  );
  const scanInfo = catalog.lastScan;
  const comparisonAllowed =
    selected &&
    !/exposure draft|discussion|feedback|faq|others/i.test(selected.type);
  const invalidDates = Boolean(from && to && from > to);

  return (
    <div className="rd-app">
      <header className="rd-header">
        <a href="/" className="rd-brand" aria-label="Regulatory Radar home">
          <span className="rd-logo">
            R<span />
          </span>
          <span>
            Regulatory Radar<small>From source to a clearer review.</small>
          </span>
        </a>
        <div className="rd-model" role="status">
          <i className={connection.ready ? "online" : ""} />
          <span>
            {connection.ready ? "Local AI ready" : "Local AI unavailable"}
            <small>
              {connection.ready
                ? connection.model
                : "You can still browse saved sources"}
            </small>
          </span>
        </div>
      </header>
      <main className="rd-main">
        <section className="rd-intro">
          <div>
            <p className="rd-eyebrow">REAL SOURCES · MANUAL SYNC</p>
            <h1>Review the source before the rule.</h1>
            <p>
              Check BNM publications, review the evidence, and attach regulatory context to your workpaper.
            </p>
          </div>
          <div className="rd-scan">
            <button
              className="rd-button primary"
              disabled={!!busy}
              onClick={scan}
            >
              <span
                className={busy.includes("Checking") ? "rd-spin" : ""}
                aria-hidden="true"
              >
                ↻
              </span>{" "}
              Check BNM updates
            </button>
            <small>
              {scanInfo
                ? `Last checked ${stamp(scanInfo.at)}`
                : "Checks only when you click. No automatic scans."}
            </small>
          </div>
        </section>
        <div className="rd-steps" aria-label="How to use this app">
          <span>
            <b>1</b> Find a publication
          </span>
          <i>→</i>
          <span>
            <b>2</b> Read the AI brief
          </span>
          <i>→</i>
          <span>
            <b>3</b> Attach workpaper context
          </span>
        </div>
        {notice && (
          <div className="rd-notice" role="status">
            <span aria-hidden="true">✓</span>
            <p>{notice}</p>
            <button
              aria-label="Dismiss update notice"
              onClick={() => setNotice("")}
            >
              ×
            </button>
          </div>
        )}
        {error && (
          <div className="rd-alert" role="alert">
            <strong>Something needs attention</strong>
            <p>{error}</p>
          </div>
        )}
        {!connection.ready && (
          <div className="rd-connection-note">
            <p>{connection.message}</p>
            <button className="rd-text-button" onClick={checkHealth}>
              Recheck AI
            </button>
          </div>
        )}
        {busy && (
          <div className="rd-progress" role="status">
            <span className="rd-spinner" />
            <div>
              <strong>
                {busy} <span>· {elapsed}s</span>
              </strong>
              <p>
                {/brief|Comparing/.test(busy)
                  ? "Working with your local model. The first run may take a few minutes."
                  : "Reading public source material. Nothing is being sent to the AI yet."}
              </p>
            </div>
            <button
              className="rd-text-button"
              onClick={() => actionAbort.current?.abort()}
            >
              Cancel
            </button>
          </div>
        )}
        <div className="rd-workspace">
          <aside className="rd-feed" aria-label="Publication list">
            <div className="rd-feed-heading">
              <div>
                <h2>
                  Publications <span>{filtered.length}</span>
                </h2>
                <p>Sorted by BNM publication date</p>
              </div>
              <a
                href={catalog.sourceUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Open BNM publication list"
              >
                <Arrow />
              </a>
            </div>
            <div className="rd-filters">
              <div
                className="rd-segment"
                role="group"
                aria-label="Filter by topic"
              >
                <button
                  aria-pressed={topic === "aml"}
                  onClick={() => setTopic("aml")}
                >
                  AML / KYC
                </button>
                <button
                  aria-pressed={topic === "all"}
                  onClick={() => setTopic("all")}
                >
                  All topics
                </button>
              </div>
              <details className="rd-date-filter">
                <summary>
                  Filter publication dates {from || to ? "· active" : ""}
                </summary>
                <div>
                  <label>
                    From
                    <input
                      type="date"
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      onInput={(e) => setFrom(e.currentTarget.value)}
                    />
                  </label>
                  <label>
                    To
                    <input
                      type="date"
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      onInput={(e) => setTo(e.currentTarget.value)}
                    />
                  </label>
                </div>
                {invalidDates && (
                  <p role="alert">
                    The “From” date must be before the “To” date.
                  </p>
                )}
                {(from || to) && (
                  <button
                    className="rd-text-button"
                    onClick={() => {
                      setFrom("");
                      setTo("");
                    }}
                  >
                    Clear dates
                  </button>
                )}
              </details>
            </div>
            <div className="rd-feed-list">
              {loading ? (
                <p className="rd-list-empty">
                  Loading your saved publications…
                </p>
              ) : !catalog.items.length ? (
                <div className="rd-list-empty">
                  <strong>Your reading list starts here.</strong>
                  <p>
                    Click “Check BNM updates” to collect real publications from
                    the source.
                  </p>
                </div>
              ) : !filtered.length ? (
                <div className="rd-list-empty">
                  <strong>No publications match these filters.</strong>
                  <p>
                    Try all topics or a wider date range. Older documents may
                    still be relevant.
                  </p>
                </div>
              ) : (
                filtered.map((item) => (
                  <button
                    key={item.id}
                    disabled={!!busy}
                    className={`rd-publication ${selected?.id === item.id ? "selected" : ""}`}
                    aria-pressed={selected?.id === item.id}
                    onClick={() => open(item)}
                  >
                    <span className="rd-card-meta">
                      <span>{item.type}</span>
                      <span>{date(item.publishedAt)}</span>
                    </span>
                    <strong>{item.title}</strong>
                    <span className="rd-card-bottom">
                      <span>{item.topic}</span>
                      {changeNames[item.change] ? (
                        <em>{changeNames[item.change]}</em>
                      ) : (
                        <span aria-hidden="true">→</span>
                      )}
                    </span>
                  </button>
                ))
              )}
            </div>
            <div className="rd-feed-foot">
              Topic labels use title keywords to help you browse. AI analysis
              happens after you open a document.
            </div>
          </aside>
          <section
            className="rd-reader"
            ref={panel}
            aria-label="Publication review"
          >
            {!selected ? (
              <div className="rd-welcome">
                <span className="rd-paper-icon" aria-hidden="true">
                  ≡
                </span>
                <p className="rd-eyebrow">START WITH THE SOURCE</p>
                <h2>
                  A clear brief.
                  <br />
                  The evidence behind it.
                </h2>
                <p>
                  Choose a publication. We’ll read the original document, then
                  help you turn selected passages into practical review
                  questions.
                </p>
                <div className="rd-welcome-note">
                  <span aria-hidden="true">↳</span>
                  <p>
                    Real BNM sources. Local AI.
                    <br />A fictional checklist you can edit for your demo.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="rd-document-heading">
                  <div className="rd-card-meta">
                    <span>{selected.type}</span>
                    <span>Published {date(selected.publishedAt)}</span>
                  </div>
                  <h2>{selected.title}</h2>
                  <div className="rd-document-links">
                    {doc && onAttachContext && <button className="rd-button primary small" disabled={!!busy} onClick={() => onAttachContext({ title: selected.title, url: doc.url, publishedAt: selected.publishedAt, retrievedAt: doc.retrievedAt, textHash: doc.textHash, brief })}>Attach to KYC workpaper →</button>}
                    <a
                      href={doc?.url || selected.url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open original source <Arrow />
                    </a>
                    {doc && (
                      <span>
                        {doc.format} · {doc.pageCount}{" "}
                        {doc.format === "PDF" ? "pages" : "section"}
                      </span>
                    )}
                  </div>
                </div>
                {!doc && !busy && (
                  <div className="rd-section">
                    <p>
                      The document could not be read. Your saved publication
                      listing is still available.
                    </p>
                    <button
                      className="rd-button secondary"
                      onClick={() => open(selected)}
                    >
                      Try reading again
                    </button>
                  </div>
                )}
                {doc && (
                  <>
                    <div
                      className="rd-reader-nav"
                      role="group"
                      aria-label="Review step"
                    >
                      <button
                        aria-pressed={step === "brief"}
                        onClick={() => setStep("brief")}
                      >
                        AI brief
                      </button>
                      <button
                        aria-pressed={step === "compare"}
                        onClick={() => setStep("compare")}
                      >
                        Checklist comparison
                      </button>
                    </div>
                    <div className="rd-section">
                      {step === "brief" ? (
                        <>
                          <div className="rd-section-title">
                            <div>
                              <h3>What’s worth a closer look?</h3>
                              <p>
                                A short brief with evidence and questions for
                                your review.
                              </p>
                            </div>
                            <button
                              className="rd-button primary small"
                              disabled={!!busy || !connection.ready}
                              onClick={() =>
                                void task(
                                  "Generating your AI brief",
                                  "brief",
                                  { id: selected.id },
                                  setBrief,
                                )
                              }
                            >
                              {busy === "Generating your AI brief"
                                ? "Generating…"
                                : brief
                                  ? "Regenerate brief"
                                  : "Generate AI brief"}{" "}
                              <span aria-hidden="true">✦</span>
                            </button>
                          </div>
                          {!brief ? (
                            <div className="rd-ready-note">
                              <strong>The source is ready.</strong>
                              <p>
                                AI will review {doc.selectedSections.length}{" "}
                                selected passages from{" "}
                                {
                                  new Set(
                                    doc.selectedSections.map((p) => p.page),
                                  ).size
                                }{" "}
                                pages. You can inspect the passages below before
                                generating a brief.
                              </p>
                            </div>
                          ) : (
                            <div className="rd-brief-points">
                              {brief.points.map((point, index) => (
                                <article className="rd-point" key={index}>
                                  <div className="rd-point-title">
                                    <span>
                                      {String(index + 1).padStart(2, "0")}
                                    </span>
                                    <h4>{point.title}</h4>
                                  </div>
                                  <p>{point.summary}</p>
                                  {point.quote && (
                                    <details className="rd-quote-details">
                                      <summary>
                                        Source evidence ·{" "}
                                        {doc.format === "PDF"
                                          ? "PDF page"
                                          : "section"}{" "}
                                        {point.page}
                                      </summary>
                                      <blockquote>
                                        <p>{point.quote}</p>
                                        <button
                                          onClick={() => evidence(point.page)}
                                        >
                                          View source · page {point.page}{" "}
                                          <span aria-hidden="true">↗</span>
                                        </button>
                                      </blockquote>
                                    </details>
                                  )}
                                  <div className="rd-question">
                                    <strong>Question to consider</strong>
                                    <p>{point.question}</p>
                                  </div>
                                  {!point.verified && (
                                    <p className="rd-invalid">
                                      Evidence could not be verified. Do not
                                      rely on this point.
                                    </p>
                                  )}
                                </article>
                              ))}
                              <p className="rd-generated">
                                Generated {stamp(brief.createdAt)} ·{" "}
                                {brief.model} · {brief.elapsedSeconds}s
                              </p>
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="rd-section-title">
                            <div>
                              <h3>What might your checklist be missing?</h3>
                              <p>
                                Compare selected source passages with the text
                                below.
                              </p>
                            </div>
                          </div>
                          <div className="rd-demo-label">
                            <span>DEMONSTRATION CHECKLIST</span>
                            <button
                              className="rd-text-button"
                              disabled={!!busy}
                              onClick={() => {
                                setChecklist(initialChecklist);
                                setReport(null);
                              }}
                            >
                              Reset sample
                            </button>
                          </div>
                          <label className="rd-sr-only" htmlFor="rd-checklist">
                            Editable demonstration checklist
                          </label>
                          <textarea
                            id="rd-checklist"
                            value={checklist}
                            onChange={(e) => {
                              setChecklist(e.target.value);
                              setReport(null);
                            }}
                            disabled={!!busy}
                            aria-invalid={checklist.length > 4000}
                          />
                          <div className="rd-checklist-meta">
                            <span>
                              Fictional starting text. Edits stay in memory
                              unless you export.
                            </span>
                            <span>
                              {checklist.length.toLocaleString()} / 4,000
                            </span>
                          </div>
                          {checklist.length > 4000 && (
                            <p className="rd-invalid" role="alert">
                              Shorten the checklist to 4,000 characters. Your
                              text has been kept in full.
                            </p>
                          )}
                          {!comparisonAllowed && (
                            <p className="rd-invalid">
                              This is not a final policy or regulation. Use its
                              brief for context, not an obligation comparison.
                            </p>
                          )}
                          <button
                            className="rd-button primary rd-compare-button"
                            disabled={
                              !!busy ||
                              !connection.ready ||
                              !comparisonAllowed ||
                              checklist.trim().length < 10 ||
                              checklist.length > 4000
                            }
                            onClick={() =>
                              void task(
                                "Comparing your checklist",
                                "compare",
                                { id: selected.id, checklist },
                                setReport,
                              )
                            }
                          >
                            {busy === "Comparing your checklist"
                              ? "Comparing…"
                              : "Compare checklist"}{" "}
                            <span aria-hidden="true">→</span>
                          </button>
                          {report && (
                            <section
                              className="rd-comparison"
                              aria-label="Checklist results"
                            >
                              <div className="rd-results-title">
                                <h3>Your checklist review</h3>
                                <span>
                                  {report.findings.length} observations ·{" "}
                                  {report.elapsedSeconds}s
                                </span>
                              </div>
                              <p className="rd-scope">
                                {report.passagesReviewed} selected passages
                                reviewed one at a time, using the closest
                                checklist entry. A missing match means “not
                                found in this checklist,” not a breach by a
                                bank.
                              </p>
                              {report.warnings.map((warning, index) => <p className="rd-scope" key={index}>{warning}</p>)}
                              {!report.findings.length && (
                                <p>
                                  No verifiable requirements were identified in
                                  these selected passages. Review the original
                                  source.
                                </p>
                              )}
                              {report.findings.map((finding, index) => (
                                <article className="rd-finding" key={index}>
                                  <span
                                    className={`rd-result-badge ${finding.status}`}
                                  >
                                    {statusNames[finding.status]}
                                  </span>
                                  <h4>{finding.title}</h4>
                                  <p>{finding.reason}</p>
                                  {!finding.evidenceVerified && <p role="note">Evidence references could not be verified. Review manually before using this observation.</p>}
                                  <details>
                                    <summary>Show supporting evidence</summary>
                                    <h5>Source passage</h5>
                                    <p>
                                      {finding.policyQuote ||
                                        "No verified source quote."}
                                    </p>
                                    {finding.page && (
                                      <button
                                        className="rd-text-button"
                                        onClick={() => evidence(finding.page)}
                                      >
                                        View page {finding.page} ↗
                                      </button>
                                    )}
                                    <h5>Closest checklist entry</h5>
                                    <p>
                                      {finding.controlQuote ||
                                        "No matching evidence found in the supplied checklist."}
                                    </p>
                                  </details>
                                  <p className="rd-next-step">
                                    <strong>Review question:</strong>{" "}
                                    {finding.nextStep}
                                  </p>
                                </article>
                              ))}
                            </section>
                          )}
                        </>
                      )}
                      <details
                        className="rd-source-panel"
                        open={showSource}
                        onToggle={(e) => setShowSource(e.currentTarget.open)}
                        ref={sourcePanel}
                      >
                        <summary>
                          Read the source passages{" "}
                          <span>{doc.pageCount} pages extracted</span>
                        </summary>
                        <label>
                          Source page
                          <select
                            value={page}
                            onChange={(e) => setPage(Number(e.target.value))}
                          >
                            {doc.pages.map((p) => (
                              <option value={p.number} key={p.number}>
                                Page {p.number}
                              </option>
                            ))}
                          </select>
                        </label>
                        <pre>
                          {doc.pages.find((p) => p.number === page)?.text}
                        </pre>
                        <p>
                          Passages selected for the brief:{" "}
                          {doc.selectedSections
                            .map((p) => `page ${p.page}`)
                            .filter((v, i, all) => all.indexOf(v) === i)
                            .join(", ")}
                          . Selection is rule-based; it is not a full-document
                          review.
                        </p>
                        <details>
                          <summary>Exact passages sent for the brief</summary>
                          {doc.selectedSections.map((section) => (
                            <div
                              className="rd-selected-passage"
                              key={section.id}
                            >
                              <strong>
                                {section.id} · page {section.page}
                              </strong>
                              <p>{section.text}</p>
                            </div>
                          ))}
                        </details>
                      </details>
                      <div className="rd-review-footer">
                        <p>
                          AI draft for human review. Source references verify
                          wording, not legal interpretation or completeness.
                        </p>
                        {(brief || report) && (
                          <Download onClick={download}>Export review</Download>
                        )}
                      </div>
                      <details className="rd-source-details">
                        <summary>Source & change history</summary>
                        <p>
                          First discovered {stamp(selected.firstSeenAt)}. This
                          is not the publication date.
                        </p>
                        <p>
                          Source checked {stamp(doc.checkedAt)}. Public source
                          text and briefs are saved on this computer.
                        </p>
                        <p>
                          {doc.previous
                            ? `Compared with the saved version from ${stamp(doc.previous.retrievedAt)}. Changed page positions: ${doc.changedPages.join(", ") || "none"}. Removed page positions: ${doc.removedPages.join(", ") || "none"}. Layout changes can also shift page positions.`
                            : "No earlier document version saved. We cannot say what changed before the first download."}
                        </p>
                        <p className="rd-hash">
                          Source fingerprint: {doc.textHash}
                        </p>
                        {selected.attachments.length > 0 && (
                          <>
                            <strong>Related links listed by BNM</strong>
                            {selected.attachments.map((link) => (
                              <p key={link.url}>
                                <a
                                  href={link.url}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {link.title} ↗
                                </a>
                              </p>
                            ))}
                            <p>
                              Related attachments are not included in this AI
                              review.
                            </p>
                          </>
                        )}
                      </details>
                    </div>
                  </>
                )}
              </>
            )}
          </section>
        </div>
        <footer className="rd-footer">
          <p>Built for a closer look—not a compliance verdict.</p>
          <details>
            <summary>What does a check cover?</summary>
            <p>
              The Banking & Islamic Banking listing, plus full text for up to
              five most recently opened documents. Other linked files are not
              downloaded during a scan. Title-based AML/KYC filters may miss
              relevant material; browse all topics too.
            </p>
            {scanInfo && (
              <p>
                Last successful listing check: {stamp(scanInfo.at)} ·{" "}
                {scanInfo.count} listed publications ·{" "}
                {scanInfo.documentsChecked} document texts checked.
              </p>
            )}
            {scanInfo?.errors.map((e, i) => (
              <p className="rd-invalid" key={i}>
                {e}
              </p>
            ))}
            <a href="/mapper">Open the standalone text comparison tool ↗</a>
          </details>
        </footer>
      </main>
      <dialog
        className="rd-export-dialog"
        ref={exportDialog}
        onClose={() => setExportText("")}
        aria-labelledby="rd-export-title"
      >
        <div className="rd-export-heading">
          <h2 id="rd-export-title">Your review, ready to keep.</h2>
          <button
            aria-label="Close export"
            onClick={() => exportDialog.current?.close()}
          >
            ×
          </button>
        </div>
        <p>
          Source references, the AI brief, and any comparison. This includes
          your checklist text when a comparison is present.
        </p>
        <textarea
          aria-label="Review JSON"
          readOnly
          value={exportText}
          spellCheck={false}
        />
        <div className="rd-export-actions">
          <button className="rd-button primary" onClick={saveExport}>
            Download JSON ↓
          </button>
          <button
            className="rd-button secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(exportText);
                setExportNotice("Review JSON copied.");
              } catch {
                setExportNotice(
                  "Clipboard access is unavailable. Select the text above and copy it manually.",
                );
              }
            }}
          >
            Copy JSON
          </button>
        </div>
        {exportNotice && <p role="status">{exportNotice}</p>}
      </dialog>
    </div>
  );
}
