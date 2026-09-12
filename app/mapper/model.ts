export type Relation = "satisfies" | "partial" | "related" | "conflicts" | "unmapped";
export type Requirement = { id: string; title: string; domain: string; text: string; source: string; locator: string; version: string; stableId?: boolean };
export type Control = { id: string; title: string; domain: string; text: string; owner: string; source: string };
export type Proposal = { requirementId: string; controlId: string | null; relation: Relation; reason: string; candidates: { controlId: string; score: number }[]; engine: "fixture" | "lexical" };
export type Decision = { requirementId: string; controlId: string | null; relation: Relation; status: "approved" | "rejected"; note: string; at: string; fingerprint: string };
export type AuditEvent = { id: string; at: string; action: string; detail: string };
export type Workspace = { name: string; version: string; mode: "demo" | "imported"; requirements: Requirement[]; controls: Control[]; proposals: Proposal[]; decisions: Record<string, Decision>; events: AuditEvent[]; baseline: Requirement[] | null; rawHash?: string; textHash?: string; baselineName?: string; history?: { version: string; name: string; capturedAt: string; requirements: Requirement[]; controls: Control[]; proposals: Proposal[]; decisions: Record<string, Decision>; rawHash?: string; textHash?: string }[] };
export const RELATIONS: Record<Relation, { label: string; short: string; className: string }> = {
  satisfies: { label: "Satisfies", short: "Full match", className: "full" },
  partial: { label: "Partially satisfies", short: "Partial match", className: "partial" },
  related: { label: "Related only", short: "Related only", className: "related" },
  conflicts: { label: "Conflicts", short: "Conflict", className: "conflict" },
  unmapped: { label: "No match found", short: "No match", className: "gap" },
};
export function normalize(text: string) { return text.normalize("NFKC").replace(/\s+/g, " ").trim(); }
export function fingerprint(req: Requirement, control?: Control) { return JSON.stringify([req.version, normalize(req.text), control?.id ?? null, normalize(control?.text ?? "")]); }
export function currentDecision(ws: Workspace, req: Requirement) {
  const d = ws.decisions[req.id];
  if (!d) return undefined;
  const control = ws.controls.find(c => c.id === d.controlId);
  return d.fingerprint === fingerprint(req, control) ? d : undefined;
}
export function metrics(ws: Workspace) {
  const decisions = ws.requirements.map(r => currentDecision(ws, r)).filter(Boolean);
  const fullApproved = decisions.filter(d => d?.status === "approved" && d.relation === "satisfies").length;
  return { total: ws.requirements.length, reviewed: decisions.length, fullApproved, coverage: ws.requirements.length ? Math.round(fullApproved / ws.requirements.length * 100) : 0, fullProposed: ws.proposals.filter(p=>p.relation==="satisfies").length, gaps: ws.proposals.filter(p=>p.relation==="unmapped").length, partial: ws.proposals.filter(p=>p.relation==="partial").length };
}
const stop = new Set("a an the and or of to in on for with by at be is are must shall should all their its least team required ensure that will as this from retain evidence policy control".split(" "));
export function tokens(text: string) { return new Set(text.toLowerCase().replace(/[^a-z0-9]+/g, " ").split(/\s+/).filter(t=>t.length>2&&!stop.has(t)).map(t=>t.replace(/(ing|ed|s)$/, ""))); }
export function similarity(a: string, b: string) { const aa=tokens(a),bb=tokens(b); let count=0; for(const word of aa) if(bb.has(word)) count++; return count/Math.max(1,Math.sqrt(aa.size*bb.size)); }
// Deliberately conservative fallback. Lexical similarity never establishes control sufficiency.
export function lexicalMapping(requirements: Requirement[], controls: Control[]): Proposal[] {
  return requirements.map(r=>{
    const candidates=controls.map(c=>({controlId:c.id,score:Math.round(similarity(r.text,`${c.title} ${c.text}`)*100)})).filter(c=>c.score>=15).sort((a,b)=>b.score-a.score).slice(0,3);
    return { requirementId:r.id,controlId:candidates[0]?.controlId??null,relation:candidates.length?"related":"unmapped",reason:candidates.length?"Shared terms identified this candidate. The local matcher cannot establish timing, scope, evidence quality or control sufficiency. Compare the source passages and record your own assessment.":"The local matcher did not find a candidate above its lexical threshold. This does not establish a control gap. Search the control library before reaching a conclusion.",candidates,engine:"lexical" };
  });
}
export function parseCSV(text: string): string[][] {
  const rows:string[][]=[];let row:string[]=[],field="",quoted=false;
  const clean=text.replace(/^\uFEFF/, "");
  for(let i=0;i<clean.length;i++) { const ch=clean[i]; if(ch==='"'){if(quoted&&clean[i+1]==='"'){field+='"';i++;}else if(quoted||field===''){quoted=!quoted;}else{field+=ch;}}else if(ch===','&&!quoted){row.push(field);field="";}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&clean[i+1]==='\n')i++;row.push(field);if(row.some(v=>v.trim()))rows.push(row);row=[];field="";}else field+=ch; }
  if(quoted)throw new Error("The CSV has an unclosed quoted field. Please check its formatting.");
  row.push(field);if(row.some(v=>v.trim()))rows.push(row);return rows;
}
export function controlsFromCSV(text: string, source: string): Control[] {
  const [header,...rows]=parseCSV(text);if(!header)throw new Error("The control CSV is empty.");
  const keys=header.map(k=>k.trim().toLowerCase());for(const key of ["id","title","description"])if(!keys.includes(key))throw new Error(`Missing CSV column: ${key}. Required columns: id, title, description.`);
  if(!rows.length)throw new Error("Add at least one control row below the CSV header.");if(rows.length>200)throw new Error("This prototype supports up to 200 controls per import.");
  const ids=new Set<string>();return rows.map((row,i)=>{const get=(key:string)=>row[keys.indexOf(key)]?.trim()??"";const id=get("id");if(!id||!get("description")||!get("title"))throw new Error(`Row ${i+2} needs an id, title and description.`);if(ids.has(id))throw new Error(`Duplicate control id: ${id}. Each control needs a unique id.`);ids.add(id);return{id,title:get("title"),text:get("description"),domain:get("domain")||"General",owner:get("owner")||"Not assigned",source};});
}
export function requirementsFromText(text: string, source: string, version: string): Requirement[] {
  const results:Requirement[]=[];const ids=new Set<string>();let page=0;
  for(const [index,line] of text.split(/\r?\n/).entries()) {
    const pageMatch=line.match(/^\[Page (\d+)\]$/);if(pageMatch){page=Number(pageMatch[1]);continue;}
    const sentences=line.match(/[^.!?]+(?:[.!?]+|$)/g)??[];
    for(const sentence of sentences){const clean=normalize(sentence);if(!/\b(must|shall|required to)\b/i.test(clean)||clean.length<25)continue;
      const match=clean.match(/^(REQ-\d+)\s*[:|.-]?\s*/i);let hash=2166136261;for(const ch of clean)hash=Math.imul(hash^ch.charCodeAt(0),16777619);
      let id=match?match[1].toUpperCase():`IMP-${(hash>>>0).toString(16).toUpperCase()}`;let suffix=2;const original=id;while(ids.has(id))id=`${original}-${suffix++}`;ids.add(id);
      results.push({id,title:clean.replace(/^(REQ-\d+)\s*[:|.-]?\s*/i,"").split(/\s+/).slice(0,8).join(" "),text:clean,domain:"Unclassified",source,locator:page?`Page ${page} · extracted line ${index+1}`:`Line ${index+1}`,version,stableId:!!match});
      if(results.length>100)throw new Error("This prototype supports up to 100 candidate requirements. Import a shorter policy section.");
    }
  }
  if(!results.length)throw new Error("No requirement sentences found. Try a text-based policy containing ‘must’, ‘shall’ or ‘required to’. Scanned PDFs need OCR first.");return results;
}
export type Change = { kind:"modified"|"added"|"removed"|"unchanged"; before?:Requirement; after?:Requirement; alignment:"id"|"exact"|"suggested"|"none" };
export function compareVersions(before: Requirement[], after: Requirement[]): Change[] {
  const remaining=new Set(before);const changes:Change[]=[];
  for(const next of after){let prior=[...remaining].find(p=>p.stableId&&next.stableId&&p.id===next.id);let alignment:Change["alignment"]=prior?"id":"none";
    if(!prior){prior=[...remaining].find(p=>normalize(p.text)===normalize(next.text));if(prior)alignment="exact";}
    if(!prior){const similar=[...remaining].map(p=>({p,s:similarity(p.text,next.text)})).sort((a,b)=>b.s-a.s);if(similar[0]?.s>=.68&&(!similar[1]||similar[0].s-similar[1].s>.1)){prior=similar[0].p;alignment="suggested";}}
    if(prior){remaining.delete(prior);changes.push({kind:normalize(prior.text)===normalize(next.text)?"unchanged":"modified",before:prior,after:next,alignment});}else changes.push({kind:"added",after:next,alignment:"none"});
  }
  for(const prior of remaining)changes.push({kind:"removed",before:prior,alignment:"none"});return changes;
}
export function csvCell(value: unknown) { const text=String(value??"");const safe=/^[\s]*[=+@-]/.test(text)?`'${text}`:text;return `"${safe.replace(/"/g,'""')}"`; }
export function matrixCSV(ws: Workspace) {
  const rows:unknown[][]=[["requirement_id","version","requirement","policy_source","locator","control_id","control_text","proposal","engine","review_status","review_decision","review_note","reviewed_at"]];
  for(const r of ws.requirements){const p=ws.proposals.find(p=>p.requirementId===r.id),d=currentDecision(ws,r);const c=ws.controls.find(c=>c.id===(d?.controlId??p?.controlId));rows.push([r.id,r.version,r.text,r.source,r.locator,c?.id,c?.text,p?.relation,p?.engine,d?.status??"pending",d?.relation,d?.note,d?.at]);}
  return rows.map(row=>row.map(csvCell).join(",")).join("\r\n");
}
export function controlsCSV(controls:Control[]) { return [["id","title","description","domain","owner"],...controls.map(c=>[c.id,c.title,c.text,c.domain,c.owner])].map(row=>row.map(csvCell).join(",")).join("\r\n"); }
