import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { clampChatPosition, parseChatTransfer } from "./chat-window";
import type { Source, Message, Publication, Point } from "./chat-window";
import "./radar-chat.css";

type Reply = { answer: string; sources: Source[]; model?: string; scope?: string };
export default function RadarChat({ publication: selectedPublication, parentBusy, standalone = false }: { publication: Publication | null; parentBusy: boolean; standalone?: boolean }) {
  const [open, setOpen] = useState(standalone);
  const [importedPublication, setImportedPublication] = useState<Publication | null>(null);
  const publication = standalone ? importedPublication : selectedPublication;
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [scope, setScope] = useState("all");
  const [waiting, setWaiting] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [position, setPosition] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [notice, setNotice] = useState("");
  const panel = useRef<HTMLElement | null>(null);
  const drag = useRef<{ pointerId: number; origin: Point; start: Point } | null>(null);
  const transferCleanup = useRef<(() => void) | null>(null);
  const abort = useRef<AbortController | null>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const launcher = useRef<HTMLButtonElement | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);
  const latestMessage = useRef<HTMLElement | null>(null);
  useEffect(() => () => { abort.current?.abort(); transferCleanup.current?.(); }, []);
  useEffect(() => {
    if (standalone) document.title = "Ask Radar · Regulatory Radar";
    if (!standalone || !location.hash.startsWith("#handoff=")) return;
    const token = location.hash.slice(9);
    history.replaceState(null, "", "/chat");
    if (!/^[a-f0-9-]{36}$/.test(token) || typeof BroadcastChannel === "undefined") { setNotice("The conversation could not be copied. You can start a new chat here."); return; }
    setTransferring(true);
    const channel = new BroadcastChannel(`radar-chat-${token}`);
    const timer = window.setTimeout(() => { channel.close(); setTransferring(false); setNotice("No conversation was received. The original chat is unchanged; you can start a new one here."); }, 10000);
    channel.onmessage = (event) => {
      if (event.data?.type !== "conversation") return;
      const data = parseChatTransfer(event.data.payload);
      if (!data) { setNotice("The conversation could not be copied safely. The original chat is unchanged."); setTransferring(false); clearTimeout(timer); channel.close(); return; }
      setMessages(data.messages); setDraft(data.draft); setScope(data.scope); setImportedPublication(data.publication);
      setNotice("Conversation copied. This tab now continues independently."); setTransferring(false);
      channel.postMessage({ type: "received" }); clearTimeout(timer); channel.close();
    };
    channel.postMessage({ type: "ready" });
    return () => { clearTimeout(timer); channel.close(); };
  }, [standalone]);
  useEffect(() => {
    if (!open || standalone) return;
    const fit = () => setPosition((current) => current && panel.current ? clampChatPosition(current, panel.current.getBoundingClientRect(), { width: document.documentElement.clientWidth, height: window.visualViewport?.height ?? window.innerHeight }) : current);
    fit(); window.addEventListener("resize", fit); window.visualViewport?.addEventListener("resize", fit);
    return () => { window.removeEventListener("resize", fit); window.visualViewport?.removeEventListener("resize", fit); };
  }, [open, standalone]);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  useEffect(() => { if (open && messages.length) { if (waiting) bottom.current?.scrollIntoView({ block: "nearest" }); else latestMessage.current?.scrollIntoView({ block: "start" }); } }, [messages, waiting, open]);
  useEffect(() => { if (!waiting) return; setSeconds(0); const timer = setInterval(() => setSeconds((n) => n + 1), 1000); return () => clearInterval(timer); }, [waiting]);
  function close() { setOpen(false); requestAnimationFrame(() => launcher.current?.focus()); }
  function moveTo(next: Point) {
    if (!panel.current) return;
    setPosition(clampChatPosition(next, panel.current.getBoundingClientRect(), { width: document.documentElement.clientWidth, height: window.visualViewport?.height ?? window.innerHeight }));
  }
  function startDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (standalone || !event.isPrimary || event.button !== 0 || !panel.current) return;
    const rect = panel.current.getBoundingClientRect();
    drag.current = { pointerId: event.pointerId, origin: { x: rect.left, y: rect.top }, start: { x: event.clientX, y: event.clientY } };
    event.currentTarget.setPointerCapture(event.pointerId); setDragging(true); event.preventDefault();
  }
  function dragMove(event: ReactPointerEvent<HTMLDivElement>) {
    if (!drag.current || drag.current.pointerId !== event.pointerId) return;
    moveTo({ x: drag.current.origin.x + event.clientX - drag.current.start.x, y: drag.current.origin.y + event.clientY - drag.current.start.y });
  }
  function endDrag() { drag.current = null; setDragging(false); }
  function moveWithKeyboard(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (standalone || !panel.current) return;
    const directions: Record<string, Point> = { ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 }, ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 } };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault(); const rect = panel.current.getBoundingClientRect(); const step = event.shiftKey ? 40 : 16;
    moveTo({ x: rect.left + direction.x * step, y: rect.top + direction.y * step });
  }
  function openChatTab() {
    if (waiting || transferring) return;
    const payload = parseChatTransfer({ version: 1, messages, draft, scope, publication });
    if (!payload) { setNotice("This conversation is too large to copy. It remains available here."); return; }
    if (typeof BroadcastChannel === "undefined") { window.open("/chat", "_blank", "noopener,noreferrer"); setNotice("This browser cannot copy conversations between tabs. A new empty chat was opened."); return; }
    const token = crypto.randomUUID();
    const channel = new BroadcastChannel(`radar-chat-${token}`);
    setTransferring(true); setNotice("");
    const timer = window.setTimeout(() => { cleanup(); setNotice("Could not confirm the new tab. Allow pop-ups and try again; your conversation is still here."); }, 12000);
    const cleanup = () => { clearTimeout(timer); channel.close(); setTransferring(false); transferCleanup.current = null; };
    transferCleanup.current = cleanup;
    channel.onmessage = (event) => {
      if (event.data?.type === "ready") channel.postMessage({ type: "conversation", payload });
      if (event.data?.type === "received") { cleanup(); setNotice("Conversation copied to a new tab. Each tab continues independently."); }
    };
    window.open(`/chat#handoff=${token}`, "_blank", "noopener,noreferrer");
  }
  async function ask(question = draft) {
    const text = question.trim();
    if (!text || waiting || parentBusy || transferring) return;
    const contextId = scope === "current" ? publication?.id : undefined;
    const history = messages.filter((m) => !m.error).slice(-4).map((m) => ({ role: m.role, content: m.text.slice(0, 1600) }));
    setMessages((items) => [...items, { role: "user", text }]); setDraft(""); setWaiting(true);
    const controller = new AbortController(); abort.current = controller;
    try {
      const response = await fetch("/api/radar/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question: text, history, scope, publicationId: contextId }), signal: controller.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not answer. Please try again.");
      const reply = result as Reply;
      setMessages((items) => [...items, { role: "assistant", text: reply.answer, sources: reply.sources, scope: reply.scope }]);
    } catch (error) {
      setMessages((items) => [...items, { role: "assistant", error: true, text: controller.signal.aborted ? "Stopped. You can retry your question." : error instanceof TypeError ? "The local app is unreachable. Restart it and try again." : error instanceof Error ? error.message : "Could not answer. Please try again." }]);
      setDraft((current) => current || text);
    } finally { setWaiting(false); abort.current = null; }
  }
  return <>
    {open && <section ref={panel} className={`rc-panel ${standalone ? "rc-standalone" : ""} ${dragging ? "rc-dragging" : ""}`} style={!standalone && position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined} id="radar-chat-panel" role={standalone ? "region" : "dialog"} aria-modal={standalone ? undefined : false} aria-labelledby="radar-chat-title" onKeyDown={(event) => { if (event.key === "Escape" && !standalone) { event.stopPropagation(); close(); } }}>
      <header className="rc-header"><div className={standalone ? "" : "rc-drag-handle"} role={standalone ? undefined : "button"} tabIndex={standalone ? undefined : 0} aria-label={standalone ? undefined : "Move chat window. Drag or use arrow keys."} onPointerDown={startDrag} onPointerMove={dragMove} onPointerUp={endDrag} onPointerCancel={endDrag} onLostPointerCapture={endDrag} onKeyDown={moveWithKeyboard}><h2 id="radar-chat-title">Ask Radar</h2><p>{standalone ? "Regulatory Radar · Local AI" : "Drag here to move"}</p></div><div className="rc-window-actions">{standalone ? <a href="/">Back to publications</a> : <><button type="button" className="rc-popout" onClick={openChatTab} disabled={waiting || transferring} aria-label="Open chat in new tab" title={waiting ? "Wait for the reply or stop it first" : "Open chat in new tab"}><svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 3h7v7M21 3l-11 11M10 5H4a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></button><button type="button" onClick={close} aria-label="Minimise chat" title="Minimise chat">−</button></>}</div></header>
      {(!standalone && position || notice || transferring) && <div className="rc-window-status"><span role="status">{transferring ? "Copying conversation…" : notice}</span>{!standalone && position && <button type="button" onClick={() => setPosition(null)}>Reset position</button>}</div>}
      <div className="rc-context"><span>BNM sources</span><span className="rc-kb-status">+ Fictional internal KB</span><label htmlFor="radar-chat-scope">Search in<select id="radar-chat-scope" value={scope} disabled={waiting} onChange={(event) => setScope(event.target.value)}><option value="all">BNM + demo policies</option><option value="internal">Demo internal policies</option><option value="current" disabled={!publication}>Open BNM publication</option></select></label>{scope === "current" && publication && <p title={publication.title}>{publication.title}</p>}<details className="rc-kb-links"><summary>Demo documents & API</summary><a href="/api/knowledge/documents/demo-kyc?format=markdown" target="_blank" rel="noreferrer">KYC policy · fictional ↗</a><a href="/api/knowledge/documents/demo-access?format=markdown" target="_blank" rel="noreferrer">Access policy · fictional ↗</a><a href="/api/knowledge/documents/demo-incidents?format=markdown" target="_blank" rel="noreferrer">Incident policy · fictional ↗</a><a href="/api/knowledge/documents" target="_blank" rel="noreferrer">View knowledge-base API (JSON) ↗</a><a href="/api/knowledge/search?q=access" target="_blank" rel="noreferrer">Try search API ↗</a></details></div>
      <div className="rc-messages" role="log" aria-label="Chat messages" aria-live="polite" aria-relevant="additions">
        {!messages.length && <div className="rc-welcome"><h3>What would you like to know?</h3><p>Ask about a publication, compare policies, or check what changed.</p><div className="rc-suggestions">{["What are the latest BNM publications?", "What changed in our demo KYC policy?", "Compare BNM e-KYC Board approval with our internal KYC policy."].map((question) => <button type="button" key={question} disabled={parentBusy} onClick={() => void ask(question)}>{question}</button>)}</div><p className="rc-hint">Internal policies are fictional interview samples. No bank's private knowledge base is connected.</p></div>}
        {messages.map((message, index) => <article ref={index === messages.length - 1 ? latestMessage : undefined} key={index} className={`rc-message ${message.role} ${message.error ? "error" : ""}`}><strong>{message.role === "user" ? "You" : "Radar"}</strong><p>{message.text}</p>{!!message.sources?.length && <details className="rc-evidence"><summary>Sources · {message.sources.length}</summary>{message.sources.map((source) => <div key={source.id}><a href={source.page ? `${source.url}#page=${source.page}` : source.url} target="_blank" rel="noreferrer">[{source.id}] {source.title}{source.page ? ` · page ${source.page}` : ""} ↗</a><small>{source.kind}</small><blockquote>{source.text}</blockquote></div>)}</details>}{message.scope && <small className="rc-answer-scope">{message.scope}</small>}</article>)}
        {waiting && <div className="rc-thinking" role="status">Reading available sources… {seconds}s</div>}<div ref={bottom} />
      </div>
      <form className="rc-compose" onSubmit={(event) => { event.preventDefault(); void ask(); }}><label className="rc-input-label" htmlFor="radar-chat-question">Your question</label><textarea ref={input} id="radar-chat-question" value={draft} disabled={transferring} maxLength={1500} rows={2} placeholder="Ask about policies or updates…" onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void ask(); } }} /><div><small>{parentBusy ? "Wait for the current source task to finish." : "AI can be wrong. Check the sources."}</small>{waiting ? <button type="button" onClick={() => abort.current?.abort()}>Stop</button> : <button type="submit" disabled={!draft.trim() || parentBusy || transferring}>Send ↑</button>}</div><p>Chat stays in this tab until refreshed.</p></form>
    </section>}
    {!standalone && <button ref={launcher} className="rc-launcher" type="button" aria-label={open ? "Minimise Ask Radar" : "Open Ask Radar"} aria-expanded={open} aria-controls="radar-chat-panel" onClick={() => open ? close() : setOpen(true)}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 3v-3H3V6a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/><path d="M7 9h10M7 13h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg><span>Ask Radar</span></button>}
  </>;
}
