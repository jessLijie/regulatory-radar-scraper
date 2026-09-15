import { useEffect, useRef, useState } from "react";
import { readConnection } from "../app/mapper/local-connection.mjs";
import { buildBriefNote, describeChanges } from "./radar-review.mjs";
import { TOPICS, publicationTags, matchesTopics, topicLabel } from "./radar-topics.mjs";
import RadarChat from "./RadarChat";
import "./regulatory-desk.css";

type Publication = { id: string; title: string; url: string; publishedAt: string; firstSeenAt: string; type: string; topic: string; change: string; available: boolean; attachments: { title: string; url: string }[] };
type Scan = { at: string; baseline: boolean; count: number; newCount: number; changedCount: number; relevantCount: number; documentsChecked: number; documentsTracked: number; errors: string[] };
type Catalog = { items: Publication[]; sourceUrl: string; lastScan: Scan | null };
type Brief = { points: { title: string; summary: string; quote: string; page: number | null; verified: boolean }[]; model: string; createdAt: string; elapsedSeconds: number; sourceIds: string[]; textHash: string };
type SourceDocument = { item: Publication; url: string; format: string; pageCount: number; pages: { number: number; text: string }[]; retrievedAt: string; checkedAt: string; textHash: string; selectedSections: { id: string; page: number; text: string }[]; brief: Brief | null; previous: { retrievedAt: string; textHash: string } | null; pageChanges: { page: number; before: string; after: string; kind: string }[] };
const flags: Record<string, string> = { new: "New to radar", listing: "Listing updated", document: "Text changed", unlisted: "No longer listed" };
const primaryTopics = ["aml", "kyc", "technology", "governance"];
const shortDate = (value: string) => value ? new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "Not stated";
const timestamp = (value: string) => new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function RegulatoryDesk() {
  const [catalog, setCatalog] = useState<Catalog>({ items: [], sourceUrl: "https://www.bnm.gov.my/banking-islamic-banking", lastScan: null });
  const [loading, setLoading] = useState(true);
  const [topics, setTopics] = useState<string[]>([]);
  const [updatesOnly, setUpdatesOnly] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<Publication | null>(null);
  const [doc, setDoc] = useState<SourceDocument | null>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [tab, setTab] = useState("brief");
  const [page, setPage] = useState(1);
  const [difference, setDifference] = useState(0);
  const [connection, setConnection] = useState({ ready: false, model: "Ollama", message: "Checking local AI…" });
  const [busy, setBusy] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [exportText, setExportText] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const action = useRef<AbortController | null>(null);
  const reader = useRef<HTMLElement | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);
  const invalidDates = Boolean(from && to && from > to);
  const scan = catalog.lastScan;
  const eligibleItems = catalog.items.filter((item) => (!updatesOnly || !!flags[item.change]) && (!from || item.publishedAt >= from) && (!to || item.publishedAt <= to)).map((item) => ({ ...item, tags: publicationTags(item.title) }));
  const items = eligibleItems.filter((item) => matchesTopics(item.tags, topics));
  const topicCounts = Object.fromEntries(TOPICS.map((topic) => [topic.id, eligibleItems.filter((item) => item.tags.includes(topic.id)).length]));
  function toggleTopic(id: string) { setTopics((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]); }
  const topicChip = (topic: { id: string; label: string }) => <button className="rd-topic-chip" key={topic.id} aria-pressed={topics.includes(topic.id)} onClick={() => toggleTopic(topic.id)}>{topic.label} <span>{topicCounts[topic.id]}</span></button>;
  const moreSelected = topics.filter((id) => !primaryTopics.includes(id)).length;

  useEffect(() => {
    const abort = new AbortController();
    async function health() {
      try { const status = await readConnection(window.location.hostname, abort.signal); if (!abort.signal.aborted) setConnection(status); } catch { /* Unmounted request. */ }
    }
    fetch("/api/radar/catalog", { cache: "no-store", signal: abort.signal }).then(async (response) => { if (!response.ok) throw new Error("Could not load saved publications. Restart the local app."); return response.json(); }).then((data) => { if (!abort.signal.aborted) setCatalog(data); }).catch((e) => { if (!abort.signal.aborted) setError(e.message); }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    void health();
    const timer = setInterval(() => { if (!document.hidden) void health(); }, 10_000);
    return () => { abort.abort(); clearInterval(timer); action.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now(); setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => { if (exportText) dialog.current?.showModal(); }, [exportText]);
  async function task<T>(label: string, endpoint: string, body: object, done: (data: T) => void) {
    const abort = new AbortController(); action.current = abort;
    setBusy(label); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/radar/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "The task could not be completed.");
      if (!abort.signal.aborted) done(data);
    } catch (e) { setError(abort.signal.aborted ? "Task cancelled. Your saved publications and briefs are unchanged." : e instanceof TypeError ? "The local app is unreachable. Restart it and try again." : e instanceof Error ? e.message : "Please try again."); }
    finally { setBusy(""); action.current = null; }
  }
  function checkUpdates() {
    void task<Catalog>("Checking BNM publications", "scan", {}, (data) => {
      setCatalog(data); setSelected(null); setDoc(null); setBrief(null);
      const result = data.lastScan!;
      setNotice(result.baseline ? `Baseline saved: ${result.count} publications. These are not all newly issued regulations.` : `${result.newCount} newly discovered · ${result.changedCount} changed in this scan. ${result.errors.length ? "Some source checks failed; see coverage below." : "Review the scan coverage below before drawing conclusions."}`);
    });
  }
  function open(item: Publication) {
    setSelected(item); setDoc(null); setBrief(null); setTab("brief"); setPage(1); setDifference(0);
    void task<SourceDocument>("Reading the original source", "document", { id: item.id }, (data) => {
      setDoc(data); setSelected(data.item); setBrief(data.brief);
      setCatalog((current) => ({ ...current, items: current.items.map((row) => row.id === data.item.id ? data.item : row) }));
    });
    if (window.innerWidth < 850) requestAnimationFrame(() => reader.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function generate() {
    if (!doc) return;
    void task<Brief>("Generating the brief", "brief", { id: doc.item.id }, (data) => {
      if (data.textHash !== doc.textHash) throw new Error("The source changed in another session. Reopen this publication before using its new brief.");
      setBrief(data);
    });
  }
  function showEvidence(number: number | null) { if (number) { setPage(number); setTab("source"); requestAnimationFrame(() => reader.current?.scrollIntoView({ behavior: "smooth", block: "start" })); } }
  function exportBrief() {
    if (!doc || !brief) return;
    try { setExportText(buildBriefNote(doc, brief)); setExportNotice(""); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not export this brief."); }
  }
  function saveBrief() {
    const url = URL.createObjectURL(new Blob([exportText], { type: "text/plain;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "regulatory-radar-bnm-brief.txt"; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setExportNotice("Download requested. If this browser blocks saving, copy the visible brief instead.");
  }
  const change = doc?.pageChanges?.[difference];

  return <div className="rd-app rd-monitor">
    <header className="rd-header"><a href="/" className="rd-brand" aria-label="Regulatory Radar home"><span className="rd-logo">R<span /></span><span>Regulatory Radar<small>BNM publication monitor</small></span></a><div className="rd-model" role="status"><i className={connection.ready ? "online" : ""} /><span>{connection.ready ? "Local AI ready" : "Local AI unavailable"}<small>{connection.model}</small></span></div></header>
    <main className="rd-main">
      <section className="rd-intro"><div><h1>What needs your attention?</h1><p>Find relevant BNM updates and get a plain-English brief with source evidence.</p></div><div className="rd-scan"><button className="rd-button primary" disabled={!!busy} onClick={checkUpdates}>↻ Check BNM updates</button><small>{scan ? `Last scan ${timestamp(scan.at)}` : "Checks only when you click. No scheduled scans."}</small></div></section>
      {notice && <div className="rd-notice" role="status"><p>{notice}</p><button aria-label="Dismiss scan notice" onClick={() => setNotice("")}>×</button></div>}
      {error && <div className="rd-alert" role="alert">{error}</div>}
      {!connection.ready && <div className="rd-connection-note"><p>{connection.message} You can still browse saved publications and compare source snapshots.</p></div>}
      {busy && <div className="rd-progress" role="status"><span className="rd-spinner" /><div><strong>{busy} · {elapsed}s</strong><p>{busy.includes("brief") ? "Your local model is reading selected source passages." : "Fetching public source material. No customer files are involved."}</p></div><button className="rd-text-button" onClick={() => action.current?.abort()}>Cancel</button></div>}
      <div className="rd-workspace">
        <aside className="rd-feed" aria-label="BNM publications"><div className="rd-feed-heading"><div><h2>Publications <span>{items.length}</span></h2><p>Newest publication dates first</p></div><a href={catalog.sourceUrl} target="_blank" rel="noreferrer" aria-label="Open the BNM publication list">↗</a></div>
          <div className="rd-filters"><div className="rd-topic-heading"><strong>Topics</strong>{topics.length > 0 && <button className="rd-text-button" onClick={() => setTopics([])}>Clear tags</button>}</div><div role="group" aria-label="Filter publications by topic" aria-describedby="topic-filter-help"><div className="rd-topic-filters"><button className="rd-topic-chip" aria-pressed={!topics.length} onClick={() => setTopics([])}>All topics <span>{eligibleItems.length}</span></button>{TOPICS.filter((topic) => primaryTopics.includes(topic.id)).map(topicChip)}</div><details className="rd-more-topics"><summary>More topics{moreSelected ? ` · ${moreSelected} selected` : ` · ${TOPICS.length - primaryTopics.length}`}</summary><div className="rd-topic-filters">{TOPICS.filter((topic) => !primaryTopics.includes(topic.id)).map(topicChip)}</div></details></div><p className="rd-topic-help" id="topic-filter-help">Select one or more. Matches any selected topic.</p>
            <label className="rd-update-filter"><input type="checkbox" checked={updatesOnly} onChange={(e) => setUpdatesOnly(e.target.checked)} /> Only flagged updates</label>
            <details className="rd-date-filter"><summary>Filter publication dates</summary><div><label>From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} onInput={(e) => setFrom(e.currentTarget.value)} /></label><label>To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} onInput={(e) => setTo(e.currentTarget.value)} /></label></div>{invalidDates && <p role="alert">The From date must be before the To date.</p>}{(from || to) && <button className="rd-text-button" onClick={() => { setFrom(""); setTo(""); }}>Clear dates</button>}</details>
          </div>
          <div className="rd-feed-list">{loading ? <p className="rd-list-empty">Loading saved publications…</p> : !items.length ? <div className="rd-list-empty"><strong>{updatesOnly ? "No flagged updates in this view." : "No publications in this view."}</strong><p>{catalog.items.length ? "Try all topics, clear the dates, or turn off the updates filter." : "Click Check BNM updates to collect the source listing."}</p></div> : items.map((item) => <button key={item.id} className={`rd-publication ${selected?.id === item.id ? "selected" : ""}`} aria-pressed={selected?.id === item.id} disabled={!!busy} onClick={() => open(item)}><div className="rd-card-meta"><span>{item.type}</span><span>{shortDate(item.publishedAt)}</span></div><strong>{item.title}</strong><div className="rd-card-bottom rd-tag-row">{item.tags.map((id) => <span className="rd-publication-tag" key={id}>{topicLabel(id)}</span>)}{flags[item.change] && <em>{flags[item.change]}</em>}</div></button>)}</div>
          <div className="rd-feed-foot">Tags are suggested from publication titles, not exhaustive AI classification. A publication can have several tags. “New to radar” means newly discovered, not newly effective. Flags refresh after each scan.</div>
        </aside>
        <section className="rd-reader" ref={reader} aria-label="Publication review">
          {!selected ? <div className="rd-welcome"><p className="rd-eyebrow">START WITH A PUBLICATION</p><h2>Get the key points.<br />Check the evidence.</h2><p>Choose a publication, then generate a short AI brief. Each point includes the original passage so you can verify the explanation.</p><div className="rd-welcome-note">Public BNM information only. No customer files or automatic compliance decisions.</div></div> : <>
            <div className="rd-document-heading"><div className="rd-card-meta"><span>{selected.type}</span><span>Published {shortDate(selected.publishedAt)}</span></div><h2>{selected.title}</h2><div className="rd-tag-row rd-document-tags" aria-label="Publication topics">{publicationTags(selected.title).map((id) => <span className="rd-publication-tag" key={id}>{topicLabel(id)}</span>)}</div><div className="rd-document-links"><a href={doc?.url || selected.url} target="_blank" rel="noreferrer">Open original source ↗</a>{doc && <span>{doc.pageCount} {doc.format === "PDF" ? "PDF pages" : "sections"} · checked {timestamp(doc.checkedAt)}</span>}</div></div>
            {!doc ? <div className="rd-section"><p>{busy ? "Reading the source…" : "Could not read this source. You can still open its original link."}</p>{!busy && <button className="rd-button secondary" onClick={() => open(selected)}>Try again</button>}</div> : <>
              <div className="rd-reader-nav" role="group" aria-label="Publication view">{[["brief", "AI brief"], ["changes", "What changed"], ["source", "Read source"]].map(([value, label]) => <button key={value} aria-pressed={tab === value} onClick={() => setTab(value)}>{label}</button>)}</div>
              <fieldset className="rd-section rd-review-fields" disabled={!!busy} aria-label="Publication review tools">
                {tab === "brief" && <>
                  <div className="rd-baseline"><strong>{doc.previous ? `${doc.pageChanges.length} page positions differ between saved versions` : "Baseline saved · no earlier version yet"}</strong><p>{doc.previous ? "Inspect the before/after text before deciding whether a requirement changed." : "We can explain this publication, but cannot claim what changed before its first saved snapshot."}</p><button className="rd-text-button" onClick={() => setTab("changes")}>Inspect change evidence →</button></div>
                  <div className="rd-section-title"><div><h3>Key points, in plain English.</h3><p>AI reads {doc.selectedSections.length} selected passages of the current document—not every page or the difference between versions.</p></div><button className="rd-button primary small" disabled={!!busy || !connection.ready} onClick={generate}>{brief ? "Regenerate brief" : "Generate brief"}</button></div>
                  {!brief ? <p className="rd-scope">Generate a short explanation of each selected passage, with its original quotation and page reference.</p> : <div className="rd-brief-points">{brief.points.map((point, index) => <article className="rd-point" key={index}><div className="rd-point-title"><span>{String(index + 1).padStart(2, "0")}</span><h4>{point.title}</h4></div><p>{point.summary}</p><details className="rd-quote-details"><summary>Source evidence · page {point.page ?? "not available"}</summary><blockquote><p>{point.quote || "No verified quotation."}</p>{point.page && <button onClick={() => showEvidence(point.page)}>Read page {point.page} ↗</button>}</blockquote></details>{!point.verified && <p className="rd-invalid">Source references could not be verified. Do not rely on this point.</p>}</article>)}<p className="rd-generated">Generated {timestamp(brief.createdAt)} · {brief.model} · {brief.elapsedSeconds}s. Quotes verify wording, not the model’s interpretation.</p><div className="rd-review-footer"><p>Verify scope, effective dates and interpretation in the original document.</p><button className="rd-button secondary" onClick={exportBrief}>Export brief ↓</button></div></div>}
                </>}
                {tab === "changes" && <>
                  <h3>What changed between saved versions?</h3><p className="rd-scope">{describeChanges(doc)}</p>
                  {selected.change === "listing" && <div className="rd-baseline"><strong>The BNM listing changed</strong><p>Earlier listing field values were not retained, so an exact title/date/link comparison is unavailable. Check the original listing and source.</p></div>}
                  {doc.previous && <><div className="rd-version-dates"><span><strong>Earlier text snapshot</strong>{timestamp(doc.previous.retrievedAt)}</span><span><strong>Current text snapshot</strong>{timestamp(doc.retrievedAt)}</span></div>{doc.pageChanges.length > 0 && <><label className="rd-field-label" htmlFor="changed-page">Changed page position</label><select id="changed-page" value={difference} onChange={(e) => setDifference(Number(e.target.value))}>{doc.pageChanges.map((item, index) => <option key={item.page} value={index}>Page {item.page} · {item.kind}</option>)}</select>{change && <div className="rd-version-diff"><div><h4>Before</h4><pre>{change.before || "No extracted text at this page position."}</pre></div><div><h4>After</h4><pre>{change.after || "No extracted text at this page position."}</pre></div></div>}</>}</>}
                  <p className="rd-scope">Retrieval dates are not issue dates or effective dates. The older snapshot is the previous distinct text seen by this app, not necessarily an official earlier edition. Page layout changes can create differences.</p>
                </>}
                {tab === "source" && <>
                  <label className="rd-field-label" htmlFor="source-page">Source page</label><select id="source-page" value={page} onChange={(e) => setPage(Number(e.target.value))}>{doc.pages.map((item) => <option key={item.number} value={item.number}>Page {item.number}</option>)}</select><pre className="rd-source-text">{doc.pages.find((item) => item.number === page)?.text}</pre>
                  <details className="rd-source-details"><summary>Exact passages selected for AI</summary>{doc.selectedSections.map((item) => <div key={item.id}><strong>{item.id} · page {item.page}</strong><p>{item.text}</p></div>)}</details>
                </>}
                <details className="rd-source-details"><summary>Source history & related links</summary><p>First discovered {timestamp(selected.firstSeenAt)}. This is different from the publication date.</p><p className="rd-hash">Current text SHA-256: {doc.textHash}</p>{doc.previous && <p className="rd-hash">Previous text SHA-256: {doc.previous.textHash}</p>}{selected.attachments.map((item) => <p key={item.url}><a href={item.url} target="_blank" rel="noreferrer">{item.title} ↗</a></p>)}<p>Related attachments are not included in this brief. Drafts are not final obligations. Older publications may have been superseded.</p></details>
              </fieldset>
            </>}
          </>}
        </section>
      </div>
      <footer className="rd-footer"><div><strong>Scan coverage</strong><p>{scan ? `${scan.count} publications in the listing · ${scan.documentsChecked} document texts checked in the last scan` : "No scan yet."}</p></div><details><summary>What is monitored—and what is not?</summary><p>The Banking & Islamic Banking listing, plus full text for up to five most recently opened documents. Other documents and attachments receive listing checks only. A clean scan does not prove BNM has no relevant changes elsewhere.</p><p>Public sources and AI briefs are saved locally. No scheduled monitoring or external notifications.</p></details></footer>
      {!!scan?.errors.length && <div className="rd-alert" role="alert"><strong>Some sources could not be checked</strong>{scan.errors.map((message, index) => <p key={index}>{message}</p>)}</div>}
    </main>
    <RadarChat publication={selected} parentBusy={!!busy} />
    <dialog className="rd-export-dialog rd-review-note" ref={dialog} onClose={() => setExportText("")} aria-labelledby="brief-export-title"><div className="rd-export-heading"><h2 id="brief-export-title">Your BNM brief</h2><button aria-label="Close brief" onClick={() => dialog.current?.close()}>×</button></div><p>Key points and original source evidence. AI-generated; verify before use.</p><div className="rd-export-actions"><button className="rd-button primary" onClick={saveBrief}>Download .txt</button><button className="rd-button secondary" onClick={async () => { try { await navigator.clipboard.writeText(exportText); setExportNotice("Brief copied."); } catch { setExportNotice("Clipboard access is unavailable. Select the visible brief and copy it manually."); } }}>Copy brief</button></div>{exportNotice && <p role="status">{exportNotice}</p>}<pre tabIndex={0} aria-label="BNM brief">{exportText}</pre></dialog>
  </div>;
}
