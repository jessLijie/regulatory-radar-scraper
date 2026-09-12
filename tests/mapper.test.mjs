import test from 'node:test';
import assert from 'node:assert/strict';
import {createDemo,demoRequirements} from '../app/mapper/demo.ts';
import {metrics,currentDecision,fingerprint,compareVersions,controlsFromCSV,controlsCSV,requirementsFromText,lexicalMapping,parseCSV,matrixCSV} from '../app/mapper/model.ts';

test('demo labels and approved coverage are distinct',()=>{
  const ws=createDemo();assert.equal(ws.controls.length,50);assert.equal(ws.requirements.length,20);
  assert.equal(metrics(ws).fullProposed,10);assert.equal(metrics(ws).partial,5);assert.equal(metrics(ws).gaps,5);assert.equal(metrics(ws).coverage,0);
  for(const index of [0,1]){const r=ws.requirements[index],p=ws.proposals[index],c=ws.controls.find(c=>c.id===p.controlId);ws.decisions[r.id]={requirementId:r.id,controlId:c.id,relation:p.relation,status:'approved',note:'verified',at:new Date().toISOString(),fingerprint:fingerprint(r,c)};}
  assert.equal(metrics(ws).reviewed,2);assert.equal(metrics(ws).coverage,5);
  ws.decisions['REQ-002'].status='rejected';assert.equal(metrics(ws).coverage,0);
});
test('changed evidence invalidates a prior decision',()=>{
  const ws=createDemo();const r=ws.requirements[1],c=ws.controls.find(c=>c.id==='IAM-02');ws.decisions[r.id]={requirementId:r.id,controlId:c.id,relation:'satisfies',status:'approved',note:'verified',at:'2026-01-01',fingerprint:fingerprint(r,c)};
  assert.ok(currentDecision(ws,r));c.text+=' Except some accounts.';assert.equal(currentDecision(ws,r),undefined);assert.equal(metrics(ws).coverage,0);
});
test('version comparison distinguishes changed, added, removed and unchanged',()=>{
  const changes=compareVersions(demoRequirements('1.0'),demoRequirements('2.0'));
  assert.equal(changes.filter(c=>c.kind==='modified').length,3);assert.equal(changes.filter(c=>c.kind==='added').length,1);assert.equal(changes.filter(c=>c.kind==='removed').length,1);assert.equal(changes.filter(c=>c.kind==='unchanged').length,16);
});
test('CSV round-trip handles quoting, multiline content and duplicate ids',()=>{
  const controls=createDemo().controls;assert.equal(controlsFromCSV(controlsCSV(controls),'test.csv').length,50);
  const rows=parseCSV('id,title,description\r\nA,"A, title","line one\nline ""two"""');assert.equal(rows[1][1],'A, title');assert.equal(rows[1][2],'line one\nline "two"');
  assert.throws(()=>controlsFromCSV('id,title,description\nA,a,b\nA,c,d','x'),/Duplicate/);
  assert.throws(()=>controlsFromCSV('id,title\nA,a','x'),/description/);
  assert.throws(()=>parseCSV('a,"unclosed'),/unclosed/);
});
test('custom file matching never presents lexical similarity as full sufficiency',()=>{
  const reqs=requirementsFromText('REQ-100: The IAM team must review privileged access quarterly.\nThis is a nonbinding explanation.','policy.txt','1.0');
  assert.equal(reqs.length,1);assert.equal(reqs[0].id,'REQ-100');assert.equal(reqs[0].locator,'Line 1');
  const proposals=lexicalMapping(reqs,createDemo().controls);assert.equal(proposals[0].relation,'related');assert.ok(proposals[0].controlId);
  assert.throws(()=>requirementsFromText('There are no obligations here.','a','1'),/No requirement/);
});
test('exports separate proposal from review and neutralize spreadsheet formulas',()=>{
  const ws=createDemo();ws.requirements[0].text='=HYPERLINK("bad")';const rows=parseCSV(matrixCSV(ws));assert.equal(rows.length,21);assert.ok(rows[1][2].startsWith("'="));assert.equal(rows[1][9],'pending');
});
