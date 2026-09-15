import { useState } from "react";
import Radar from "./Radar";
import KycDesk, { type RegulatoryContext } from "./KycDesk";
import "./kyc.css";

export default function AuditApp() {
  const [tab, setTab] = useState("case");
  const [context, setContext] = useState<RegulatoryContext | null>(null);
  return <div className="rd-app audit-app">
    <header className="rd-header"><a className="rd-brand" href="/" aria-label="Regulatory Radar home"><span className="rd-logo">R<span /></span><span>Regulatory Radar<small>Evidence first. Human judgment, always.</small></span></a><span className="audit-local">LOCAL WORKSPACE <i /> TRAINING DATA</span></header>
    <nav className="audit-nav" aria-label="Workspace"><button aria-current={tab === "sources" ? "page" : undefined} onClick={() => setTab("sources")}>BNM updates</button><button aria-current={tab === "case" ? "page" : undefined} onClick={() => setTab("case")}>KYC file review <span>1 case</span></button><p>Sources → checks → workpaper</p></nav>
    <div className="audit-sources" hidden={tab !== "sources"}><Radar onAttachContext={(source) => { setContext(source); setTab("case"); window.scrollTo({ top: 0 }); }} /></div>
    <div hidden={tab !== "case"}><KycDesk context={context} onBrowse={() => { setTab("sources"); window.scrollTo({ top: 0 }); }} onClear={() => setContext(null)} /></div>
  </div>;
}
