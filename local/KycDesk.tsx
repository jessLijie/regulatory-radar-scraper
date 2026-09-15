import { useEffect, useRef, useState } from "react";
import { readConnection } from "../app/mapper/local-connection.mjs";
import { DEMO_DATE, DEMO_POLICY, FACT_FIELDS, SAMPLE_PACKET, FIXED_PACKET, sourceLines, verifyFact, runChecks, reviewComplete, workpaperText } from "./kyc-rules.mjs";

export type RegulatoryContext = {
  title: string; url: string; publishedAt: string; retrievedAt: string; textHash: string;
  brief: { points: { title: string; summary: string; quote: string; page: number | null; verified: boolean }[] } | null;
};
type Fact = { value: string; lineId: string; origin?: string; verified?: boolean; quote?: string };
type Extraction = { facts: Record<string, Fact>; model: string; createdAt: string; elapsedSeconds: number; inputHash: string };
type Finding = ReturnType<typeof runChecks>[number];
type Decision = { status: string; note: string };

export default function KycDesk({ context, onBrowse, onClear }: { context: RegulatoryContext | null; onBrowse: () => void; onClear: () => void }) {
  const [packet, setPacket] = useState(SAMPLE_PACKET);
  const [reviewDate, setReviewDate] = useState(DEMO_DATE);
  const [policyApproved, setPolicyApproved] = useState(false);
  const [factsConfirmed, setFactsConfirmed] = useState(false);
  const [extraction, setExtraction] = useState<Extraction | null>(null);
  const [showPrepared, setShowPrepared] = useState(true);
  const [facts, setFacts] = useState<Record<string, Fact>>({});
  const [findings, setFindings] = useState<Finding[]>([]);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [reviewer, setReviewer] = useState("");
  const [scopeNote, setScopeNote] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [ready, setReady] = useState(false);
  const [modelMessage, setModelMessage] = useState("Checking local AI…");
  const [preview, setPreview] = useState("");
  const [exportNotice, setExportNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const dialog = useRef<HTMLDialogElement | null>(null);
  const factsPanel = useRef<HTMLElement | null>(null);
  const resultsPanel = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const health = new AbortController();
    async function check() {
      try {
        const status = await readConnection(window.location.hostname, health.signal);
        if (!health.signal.aborted) { setReady(status.ready); setModelMessage(status.ready ? `${status.model} · local AI ready` : status.message); }
      } catch { /* An unmounted or superseded health request. */ }
    }
    void check();
    const timer = setInterval(() => { if (!document.hidden) void check(); }, 10_000);
    return () => { clearInterval(timer); health.abort(); controller.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!busy) return;
    const start = Date.now(); setElapsed(0);
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    if (!extraction) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [extraction]);
  useEffect(() => { if (preview) dialog.current?.showModal(); }, [preview]);
  // Navigation between workspaces preserves memory; no private packet is auto-saved.
  function clearResults() { setFactsConfirmed(false); setFindings([]); setDecisions({}); setPreview(""); setNotice(""); }
  function changePacket(value: string) {
    setPacket(value); setExtraction(null); setFacts({}); setShowPrepared(true); clearResults(); setError("");
  }
  async function extract() {
    const abort = new AbortController(); controller.current = abort;
    setBusy(true); setError(""); setExtraction(null); setFacts({}); clearResults();
    try {
      const response = await fetch("/api/kyc/extract", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ packet }), signal: abort.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Extraction failed. No results were substituted.");
      setExtraction(data); setFacts(data.facts); setShowPrepared(false);
      requestAnimationFrame(() => factsPanel.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
    } catch (e) {
      setError(abort.signal.aborted ? "Extraction cancelled. No checks have been run." : e instanceof Error ? e.message : "Could not connect to the local app.");
    } finally { setBusy(false); }
  }
  function editFact(key: string, patch: Partial<Fact>) {
    setFacts((current) => ({ ...current, [key]: { ...current[key], ...patch, origin: "human" } }));
    clearResults();
  }
  function checkFile() {
    if (!extraction || !factsConfirmed || !policyApproved || busy) return;
    try {
      setError(""); setFindings(runChecks({ packet, facts, reviewDate })); setDecisions({});
      requestAnimationFrame(() => resultsPanel.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    } catch (e) { setError(e instanceof Error ? e.message : "Check could not run."); }
  }
  function decide(id: string, patch: Partial<Decision>) {
    setDecisions((current) => ({ ...current, [id]: { ...(current[id] || { status: "pending", note: "" }), ...patch } }));
    setPreview("");
  }
  function showWorkpaper() {
    if (!extraction || !findings.length) return;
    setExportNotice("");
    setPreview(workpaperText({ reviewDate, packet, findings, decisions, reviewer, scopeNote, extraction, context, generatedAt: new Date().toISOString() }));
  }
  const lines: { id: string; text: string }[] = sourceLines(packet);
  const flagCount = findings.filter((f) => f.status === "exception").length;
  const clarificationCount = findings.filter((f) => f.status === "review").length;
  const complete = Boolean(reviewer.trim()) && reviewComplete(findings, decisions);
  const packetProblem = packet.length > 6000 || new TextEncoder().encode(packet).length > 9000 || lines.length > 40;

  return <main className="kyc-main">
    <section className="kyc-heading">
      <div><p className="kyc-eyebrow">AML / KYC · ONE FILE, FROM EVIDENCE TO REVIEW</p><h1>Turn a KYC file into a reviewable workpaper.</h1><p>AI reads the text. Code checks the criteria. You make the judgment.</p></div>
      <span className={`kyc-model ${ready ? "ready" : ""}`} role="status">{modelMessage}</span>
    </section>
    <div className="kyc-boundary"><strong>Fictional training case</strong><span>One company, one person, three sample rules. No real customer data. Nothing is saved automatically.</span></div>
    <section className="kyc-context" aria-label="Regulatory context">
      <span className="kyc-context-icon" aria-hidden="true">↗</span>
      <div><strong>{context ? context.title : "Start with a real BNM source"}</strong><p>{context ? "Attached as background only. It does not define or change the fictional rules below." : "Check publications, read an evidence-linked AI brief, then attach a source to this workpaper."}</p>
        {context && <a href={context.url} target="_blank" rel="noreferrer">Open attached source ↗</a>}
      </div>
      <div className="kyc-context-actions"><button className="rd-button secondary small" onClick={onBrowse}>{context ? "Review BNM sources" : "Browse BNM updates"}</button>{context && <button className="rd-text-button" onClick={onClear}>Remove context</button>}</div>
    </section>
    {error && <div className="rd-alert" role="alert">{error}</div>}
    {notice && <div className="rd-notice" role="status">{notice}</div>}
    <div className="kyc-grid">
      <div className="kyc-inputs">
        <section className="kyc-card">
          <div className="kyc-card-heading"><span className="kyc-number">1</span><div><h2>{extraction && !showPrepared ? "Case prepared" : "Prepare the case"}</h2><p>Atlas Orchard Trading · Avery Tan · fictional</p></div>{extraction ? <button className="rd-button secondary small kyc-heading-action" onClick={() => setShowPrepared(!showPrepared)}>{showPrepared ? "Collapse file" : "Edit file"}</button> : <button className="rd-button primary small kyc-heading-action" disabled={!ready || busy || !policyApproved || packet.trim().length < 20 || packetProblem} onClick={() => void extract()}>{busy ? "Extracting…" : "Extract facts"}</button>}</div>
          <div className="kyc-card-body" hidden={!!extraction && !showPrepared}>
            <details className="kyc-policy"><summary>Review the 3 fictional policy rules <span>v{DEMO_POLICY.version}</span></summary><ol>{DEMO_POLICY.rules.map((rule) => <li key={rule.id}><strong>{rule.id} · {rule.title}</strong><p>{rule.criterion}</p></li>)}</ol><p className="kyc-note">{DEMO_POLICY.id} is a made-up internal policy for this example, not BNM guidance. Only these fixed rules are supported.</p></details>
            <label className="kyc-check"><input type="checkbox" checked={policyApproved} disabled={busy} onChange={(e) => { setPolicyApproved(e.target.checked); clearResults(); }} /><span>I have reviewed and approve these fictional criteria for this demo run.</span></label>
            <div className="kyc-input-heading"><label htmlFor="kyc-date">Review date</label><input id="kyc-date" type="date" value={reviewDate} disabled={busy} onChange={(e) => { setReviewDate(e.target.value); clearResults(); }} onInput={(e) => { setReviewDate(e.currentTarget.value); clearResults(); }} /></div>
            <div className="kyc-input-heading"><label htmlFor="kyc-packet">Customer file excerpt</label><span>{packet.length.toLocaleString()} / 6,000</span></div>
            <textarea id="kyc-packet" value={packet} disabled={busy} spellCheck={false} onChange={(e) => changePacket(e.target.value)} rows={9} />
            {packetProblem && <p className="kyc-unverified" role="alert">This input exceeds 6,000 characters, 40 lines or 9,000 UTF-8 bytes. It has not been truncated. Shorten it deliberately before extraction.</p>}
            <div className="kyc-samples"><span>Change the input:</span><button disabled={busy} onClick={() => { changePacket(SAMPLE_PACKET); setNotice("Original fictional file loaded. Run extraction again to check it."); }}>Original file</button><button disabled={busy} onClick={() => { changePacket(FIXED_PACKET); setNotice("Fictional address proof updated to 1 September 2026. Run extraction and checks again; no result is prefilled."); }}>Updated address proof</button></div>
            <p className="kyc-note">Text only, one company and one person. Dates use YYYY-MM-DD. Editing the file or criteria clears downstream results.</p>
            <button className="rd-button primary kyc-primary" disabled={!ready || busy || !policyApproved || packet.trim().length < 20 || packetProblem} onClick={() => void extract()}>{busy ? `Extracting locally… ${elapsed}s` : extraction ? "Re-extract facts with local AI" : "Extract facts with local AI"}<span aria-hidden="true">✦</span></button>
            {!policyApproved && <p className="kyc-note">Review and approve the sample criteria to begin.</p>}
            {busy && <div className="kyc-busy" role="status"><span>Reading this input with Ollama. Usually under a minute once warm.</span><button className="rd-text-button" onClick={() => controller.current?.abort()}>Cancel</button></div>}
          </div>
        </section>
        {extraction && <section className="kyc-card" ref={factsPanel} aria-label="Extracted facts">
          <div className="kyc-card-heading"><span className="kyc-number">2</span><div><h2>Verify the extracted facts</h2><p>AI draft · {extraction.elapsedSeconds}s · correct any mistaken value or line.</p></div></div>
          <div className="kyc-card-body">
            {FACT_FIELDS.map(({ key, label }) => {
              const fact = facts[key] || { value: "", lineId: "" };
              const evidence = verifyFact(fact, lines);
              return <div className="kyc-fact" key={key}>
                <label htmlFor={`fact-${key}`}>{label}<span>{fact.origin === "human" ? "Human corrected" : "AI proposed"}</span></label>
                <div className="kyc-fact-inputs"><input id={`fact-${key}`} value={fact.value} maxLength={100} placeholder="Not found" onChange={(e) => editFact(key, { value: e.target.value })} /><select aria-label={`${label} source line`} value={fact.lineId} onChange={(e) => editFact(key, { lineId: e.target.value })}><option value="">No source</option>{lines.filter((line) => line.text).map((line) => <option key={line.id} value={line.id}>{line.id}</option>)}</select></div>
                <p className={evidence.verified ? "kyc-evidence" : "kyc-unverified"}>{evidence.verified ? `${evidence.lineId}: ${evidence.quote}` : "No exact source match. This field will need evidence review, not an automatic pass."}</p>
              </div>;
            })}
            <details className="kyc-lines"><summary>Show all numbered source lines</summary>{lines.map((line) => <p key={line.id}><b>{line.id}</b> {line.text}</p>)}</details>
            <label className="kyc-check"><input type="checkbox" checked={factsConfirmed} onChange={(e) => { setFactsConfirmed(e.target.checked); setFindings([]); setDecisions({}); }} /><span>I checked these fields against the file, including the person, company and date meanings. Exact text matching alone does not verify the interpretation.</span></label>
            <button className="rd-button primary kyc-primary" disabled={!policyApproved || !factsConfirmed || !reviewDate} onClick={checkFile}>Run 3 policy checks <span aria-hidden="true">→</span></button>
          </div>
        </section>}
      </div>
      <section className="kyc-card kyc-results" ref={resultsPanel} aria-label="Audit findings">
        <div className="kyc-card-heading"><span className="kyc-number">3</span><div><h2>Review & prepare the workpaper</h2><p>{findings.length ? "Results from code, with a separate human disposition." : "The finished output—not just an AI summary."}</p></div></div>
        {!findings.length ? <div className="kyc-empty"><div className="kyc-paper-icon" aria-hidden="true">≡</div><h3>Your review will appear here</h3><p>Extract the facts, check them against the source, then run the three rules.</p><div className="kyc-empty-rules">{DEMO_POLICY.rules.map((rule) => <div key={rule.id}><span>{rule.id} · {rule.title}</span><small>Not run</small></div>)}</div><p className="kyc-note">Each finding will include the criterion, observed condition, source evidence and your review decision.</p></div> : <div className="kyc-card-body">
          <div className="kyc-result-summary"><div><strong>{findings.filter((f) => f.status === "pass").length}</strong><span>Meet demo criteria</span></div><div><strong>{flagCount}</strong><span>Exceptions flagged</span></div><div><strong>{clarificationCount}</strong><span>Need evidence</span></div></div>
          <p className="kyc-note">As of {reviewDate}. These are file-level checks, not customer or AML approval.</p>
          {findings.map((finding) => <details className={`kyc-finding ${finding.status}`} key={finding.id} open={finding.status !== "pass"}>
            <summary><span>{finding.id} · {finding.title}</span><span className={`kyc-badge ${finding.status}`}>{finding.status === "pass" ? "Meets criterion" : finding.status === "exception" ? "Exception" : "Needs review"}</span></summary>
            <div className="kyc-finding-body"><h4>Criteria</h4><p>{finding.criterion}</p><h4>Condition</h4><p>{finding.condition}</p><h4>Evidence · {finding.evidence.lineId || "not found"}</h4><blockquote>{finding.evidence.verified ? finding.evidence.quote : "No source-verified value. Request or clarify the record."}</blockquote><h4>Suggested follow-up</h4><p>{finding.nextStep}</p>
              <label htmlFor={`decision-${finding.id}`}>Your review</label><select id={`decision-${finding.id}`} value={decisions[finding.id]?.status || "pending"} onChange={(e) => decide(finding.id, { status: e.target.value })}><option value="pending">Not reviewed</option>{finding.status === "pass" ? <option value="acknowledged">Reviewed the criterion and evidence</option> : <><option value="confirmed">Confirm this flag for follow-up</option><option value="dismissed">Dismiss this flag with a reason</option></>}</select>
              <label htmlFor={`note-${finding.id}`}>Review rationale {finding.status === "pass" ? "(optional)" : "(required)"}</label><textarea id={`note-${finding.id}`} rows={2} maxLength={1000} value={decisions[finding.id]?.note || ""} onChange={(e) => decide(finding.id, { note: e.target.value })} placeholder="What did you verify? Why keep or dismiss this flag?" />
              {finding.status !== "pass" && decisions[finding.id]?.status && decisions[finding.id].status !== "pending" && !decisions[finding.id].note.trim() && <p className="kyc-unverified">Add a rationale to complete this review.</p>}
            </div>
          </details>)}
          <div className="kyc-reviewer"><label htmlFor="kyc-reviewer">Reviewer label <small>Demo only · not authenticated</small></label><input id="kyc-reviewer" value={reviewer} maxLength={100} onChange={(e) => setReviewer(e.target.value)} placeholder="Your name or interview-demo label" /><label htmlFor="kyc-scope">Scope / reviewer note <small>Optional</small></label><textarea id="kyc-scope" rows={2} maxLength={1500} value={scopeNote} onChange={(e) => setScopeNote(e.target.value)} placeholder="For example: original documents still need to be inspected." /></div>
          <div className="kyc-review-state"><span className={`kyc-badge ${complete ? "pass" : "review"}`}>{complete ? "Demo review completed" : "Draft · review incomplete"}</span><p>{complete ? "All three results have a reviewer disposition. Original machine results are preserved." : "Review all three findings and add a reviewer label. Exceptions need a rationale. You can still export a draft."}</p></div>
          <button className="rd-button primary kyc-primary" onClick={showWorkpaper}>Open readable workpaper <span aria-hidden="true">↗</span></button>
        </div>}
      </section>
    </div>
    <footer className="kyc-footer"><strong>What this project demonstrates</strong><span>BNM collection & change detection → local AI extraction → deterministic checks → human-reviewed workpaper.</span><small>BNM context never activates new rules automatically. No scheduled scans, customer approval, notifications or banking integration.</small></footer>
    <dialog className="kyc-export" ref={dialog} onCancel={() => setPreview("")} onClose={() => setPreview("")}>
      <div className="kyc-export-actions"><div><h2>Review workpaper</h2><p>Editable local output, not a signed audit record.</p></div><button className="rd-button secondary small" onClick={() => { dialog.current?.close(); setPreview(""); }}>Close</button></div>
      <div className="kyc-export-actions"><button className="rd-button primary small" onClick={() => window.print()}>Print workpaper</button><button className="rd-button secondary small" onClick={async () => { try { await navigator.clipboard.writeText(preview); setExportNotice("Workpaper copied."); } catch { setExportNotice("Clipboard blocked. Select the visible workpaper text and copy it manually."); } }}>Copy text</button><button className="rd-button secondary small" onClick={() => { const url = URL.createObjectURL(new Blob([preview], { type: "text/plain;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "regulatory-radar-kyc-workpaper.txt"; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setExportNotice("Download requested. If this browser blocks it, copy the visible text instead."); }}>Download .txt</button></div>
      {exportNotice && <p role="status">{exportNotice}</p>}
      <pre className="kyc-workpaper" tabIndex={0} aria-label="Readable KYC workpaper">{preview}</pre>
    </dialog>
  </main>;
}
