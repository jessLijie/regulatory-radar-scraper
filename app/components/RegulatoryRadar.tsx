"use client";

import { useMemo, useState } from "react";

type RegulatoryItem = {
  id: string;
  title: string;
  source: string;
  sourceUrl: string;
  documentUrl: string;
  date: string | null;
  dateLabel: string;
  type: string;
  summary: string;
  domains: string[];
  relevance: "high" | "medium" | "watch";
  reason: string;
};

type SourceStatus = {
  id: string;
  name: string;
  url: string;
  ok: boolean;
  count: number;
  message: string;
};

type Entity = {
  name: string;
  url: string;
  licences: string[];
};

type ScanResult = {
  scannedAt: string;
  definition: string;
  items: RegulatoryItem[];
  entities: Entity[];
  sources: SourceStatus[];
  warning: string;
};

const TYPE_OPTIONS = ["All", "Policy & guidance", "Legislation", "Enforcement action"];

function displayDate(value: string | null) {
  if (!value) return "Date not stated";
  return new Intl.DateTimeFormat("en-MY", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function filterType(item: RegulatoryItem, selected: string) {
  if (selected === "All") return true;
  if (selected === "Policy & guidance") return !/legislation|enforcement/i.test(item.type);
  return item.type.toLowerCase().includes(selected.toLowerCase());
}

function RadarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="radar-icon">
      <circle cx="16" cy="16" r="13" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16" cy="16" r="8" fill="none" stroke="currentColor" strokeWidth="1.4" opacity=".65" />
      <circle cx="16" cy="16" r="2.1" fill="currentColor" />
      <path d="M16 16 27 8M16 3v26M3 16h26" fill="none" stroke="currentColor" strokeWidth="1.2" opacity=".75" />
    </svg>
  );
}

function Spinner() {
  return <span className="spinner" aria-hidden="true" />;
}

export function RegulatoryRadar() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState("All");
  const [query, setQuery] = useState("");

  const visibleItems = useMemo(() => {
    if (!result) return [];
    const normalized = query.trim().toLowerCase();
    return result.items.filter((item) => {
      const matchesType = filterType(item, selectedType);
      const searchable = `${item.title} ${item.summary} ${item.domains.join(" ")} ${item.source}`.toLowerCase();
      return matchesType && (!normalized || searchable.includes(normalized));
    });
  }, [query, result, selectedType]);

  async function runScan() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/scrape", {
        method: "POST",
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      const data = await response.json() as ScanResult & { error?: string };
      if (!response.ok && !data.sources?.some((source) => source.ok)) {
        throw new Error(data.error || "BNM sources could not be reached. Please try again.");
      }
      setResult(data);
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "The scan could not be completed.");
    } finally {
      setLoading(false);
    }
  }

  const highPriority = result?.items.filter((item) => item.relevance === "high").length ?? 0;
  const healthySources = result?.sources.filter((source) => source.ok).length ?? 0;

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Regulatory Radar home">
          <span className="brand-mark" aria-hidden="true">R</span>
          <span>
            <strong>Regulatory Radar</strong>
            <small>Audit intelligence</small>
          </span>
        </a>
        <a href="/mapper" className="environment-pill" style={{textDecoration:"none"}}><span /> Open policy checker →</a>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow"><RadarIcon /> BNM intelligence monitor</p>
          <h1>Turn regulatory change into an auditable next step.</h1>
          <p className="hero-description">
            Run an on-demand server-side scan of four BNM sources. The radar extracts dated records,
            classifies audit domains, and keeps every finding linked to its original source.
          </p>
          <div className="hero-actions">
            <button className="scan-button" type="button" onClick={runScan} disabled={loading}>
              {loading ? <Spinner /> : <RadarIcon />}
              {loading ? "Scanning BNM…" : result ? "Scan BNM again" : "Scan BNM now"}
            </button>
            <p>Nothing is loaded until you start a scan.</p>
          </div>
        </div>
        <aside className="method-card" aria-label="How the live scan works">
          <div className="method-number">04</div>
          <p className="method-kicker">Live public sources</p>
          <h2>One click, traceable evidence</h2>
          <ol>
            <li><span>01</span>Fetch the BNM pages from the server</li>
            <li><span>02</span>Extract documents, dates and institutions</li>
            <li><span>03</span>Rank the newest dated changes first</li>
            <li><span>04</span>Tag likely audit domains for triage</li>
          </ol>
        </aside>
      </section>

      <section className="workspace" aria-live="polite">
        {!result && !loading && !error && (
          <div className="empty-state">
            <div className="empty-rings"><RadarIcon /></div>
            <div>
              <p className="eyebrow">Awaiting scan</p>
              <h2>No mock records are shown</h2>
              <p>Press <strong>Scan BNM now</strong> to retrieve the current public data directly from BNM.</p>
            </div>
          </div>
        )}

        {loading && (
          <div className="loading-state">
            <div className="pulse-radar"><RadarIcon /></div>
            <div>
              <p className="eyebrow">Live request in progress</p>
              <h2>Scanning BNM</h2>
              <p>Checking policy, legislation, enforcement and FSP records.</p>
            </div>
          </div>
        )}

        {error && (
          <div className="error-state" role="alert">
            <div><strong>Scan unsuccessful</strong><p>{error}</p></div>
            <button type="button" onClick={runScan}>Try again</button>
          </div>
        )}

        {result && !loading && (
          <>
            <div className="result-header">
              <div>
                <p className="eyebrow"><span className="live-dot" /> Live scan complete</p>
                <h2>Regulatory change feed</h2>
                <p className="scan-time">
                  Scanned {new Intl.DateTimeFormat("en-MY", { dateStyle: "medium", timeStyle: "short" }).format(new Date(result.scannedAt))}
                </p>
              </div>
              <div className="metric-row">
                <div><strong>{result.items.length}</strong><span>Dated records</span></div>
                <div><strong>{highPriority}</strong><span>High relevance</span></div>
                <div><strong>{healthySources}/4</strong><span>Sources reached</span></div>
              </div>
            </div>

            <div className="definition-strip">
              <strong>How “latest” is defined</strong>
              <p>{result.definition}</p>
            </div>

            <div className="dashboard-grid">
              <div className="feed-column">
                <div className="filters" aria-label="Filter scan results">
                  <div className="type-filters">
                    {TYPE_OPTIONS.map((option) => (
                      <button
                        key={option}
                        type="button"
                        className={selectedType === option ? "active" : ""}
                        onClick={() => setSelectedType(option)}
                      >
                        {option}
                      </button>
                    ))}
                  </div>
                  <label className="search-field">
                    <span className="sr-only">Search scan results</span>
                    <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.4 15.4 4.1 4.1" /></svg>
                    <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search domain or keyword" />
                  </label>
                </div>

                <div className="feed-count">Showing {visibleItems.length} of {result.items.length} extracted records</div>
                <div className="record-list">
                  {visibleItems.map((item) => (
                    <article className="record-card" key={item.id}>
                      <div className="record-rail">
                        <time dateTime={item.date ?? undefined}>{displayDate(item.date)}</time>
                        <span className={`relevance ${item.relevance}`}>{item.relevance}</span>
                      </div>
                      <div className="record-body">
                        <div className="record-meta">
                          <span>{item.type}</span>
                          <span>{item.source}</span>
                        </div>
                        <h3><a href={item.documentUrl} target="_blank" rel="noreferrer">{item.title}</a></h3>
                        <p>{item.summary}</p>
                        <div className="intelligence-note">
                          <strong>Automated triage</strong>
                          <span>{item.reason}</span>
                        </div>
                        <div className="record-footer">
                          <div className="domain-tags">
                            {item.domains.map((domain) => <span key={domain}>{domain}</span>)}
                          </div>
                          <a href={item.sourceUrl} target="_blank" rel="noreferrer">View BNM source <span aria-hidden="true">↗</span></a>
                        </div>
                      </div>
                    </article>
                  ))}
                  {!visibleItems.length && (
                    <div className="no-match">No records match this filter. Try a broader keyword or select All.</div>
                  )}
                </div>
              </div>

              <aside className="sidebar">
                <section className="side-card">
                  <div className="side-heading"><h3>Source health</h3><span>{healthySources}/4 live</span></div>
                  <div className="source-list">
                    {result.sources.map((source) => (
                      <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>
                        <span className={source.ok ? "source-ok" : "source-fail"} />
                        <span><strong>{source.name}</strong><small>{source.message}</small></span>
                        <span aria-hidden="true">↗</span>
                      </a>
                    ))}
                  </div>
                </section>

                <section className="side-card">
                  <div className="side-heading"><h3>FSP directory</h3><span>Entity checks</span></div>
                  <p className="muted">
                    The current BNM directory is checked during every scan for entity and licence applicability.
                  </p>
                </section>

                <section className="review-card">
                  <span>Control note</span>
                  <h3>Human review remains mandatory</h3>
                  <p>{result.warning}</p>
                </section>
              </aside>
            </div>
          </>
        )}
      </section>

      <footer>
        <p>Regulatory Radar · Internal audit workflow prototype</p>
        <p>Public BNM data is fetched only when a user runs a scan.</p>
      </footer>
    </main>
  );
}
