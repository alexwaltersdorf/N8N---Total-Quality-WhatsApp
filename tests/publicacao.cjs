const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8').replace(/^\uFEFF/,'');
const {prepare}=require('../scripts/preparar-atualizacao.cjs');
const manifest=JSON.parse(read('workflows/manifesto.json'));
let total=0;
const test=(name,fn)=>{fn();total++;console.log('OK '+name)};
test('Templates públicos não incluem vínculos privados ou dados de pacientes',()=>{
 for(const file of Object.keys(manifest.workflows)){
  const w=JSON.parse(read('workflows/'+file));
  assert.equal(w.active,false);assert.deepEqual(w.pinData,{});
  assert(!w.id&&!w.versionId&&!w.meta);
  for(const n of w.nodes){
   assert(!n.credentials&&!n.webhookId&&!n.notes,n.name);
   if(n.type==='n8n-nodes-base.webhook')assert.equal(n.parameters.path,'RECONFIGURAR_WEBHOOK_PRIVADO');
   if(n.type==='n8n-nodes-base.googleSheets')assert.equal(n.parameters.documentId.value,'RECONFIGURAR_PLANILHA_PRIVADA');
   for(const h of n.parameters.headerParameters?.parameters||[])if(/authorization|apikey/i.test(h.name))assert(/^=(?:Bearer )?\{\{\s*\$env\.[A-Z0-9_]+\s*\}\}$/.test(h.value),n.name);
  }
 }
});
const template={name:'Teste',nodes:[
 {id:'p',name:'DB novo',type:'n8n-nodes-base.postgres',parameters:{}},
 {id:'w',name:'Webhook',type:'n8n-nodes-base.webhook',parameters:{path:'RECONFIGURAR_WEBHOOK_PRIVADO'}},
 {id:'h',name:'Enviar',type:'n8n-nodes-base.httpRequest',parameters:{url:'={{$env.TEST}}',options:{timeout:30000}}},
 {id:'s',name:'Planilha',type:'n8n-nodes-base.googleSheets',parameters:{documentId:{value:'RECONFIGURAR_PLANILHA_PRIVADA'}}}
],connections:{},settings:{timezone:'America/Sao_Paulo'}};
const current={id:'flow',name:'Original',versionId:'v1',nodes:[
 {id:'db',name:'DB antigo',type:'n8n-nodes-base.postgres',credentials:{postgres:{id:'fake-db'}}},
 {id:'w',name:'Webhook',type:'n8n-nodes-base.webhook',webhookId:'fake-hook',parameters:{path:'private-fixture',authentication:'headerAuth'},credentials:{httpHeaderAuth:{id:'fake-auth'}}},
 {id:'h',name:'Enviar',type:'n8n-nodes-base.httpRequest',parameters:{url:'https://fixture.example.invalid/send',options:{timeout:999},sendHeaders:true,headerParameters:{parameters:[{name:'apikey',value:'fixture-only'}]}}},
 {id:'s',name:'Planilha',type:'n8n-nodes-base.googleSheets',parameters:{documentId:{value:'fake-sheet'},sheetName:{value:'fake-tab'}},credentials:{googleSheetsOAuth2Api:{id:'fake-sheets'}}}
],settings:{executionOrder:'v1'}};
const meta={workflow_id:'flow',baseline_version_id:'v1'};
test('Preparação recupera vínculos privados e preserva as correções',()=>{
 const before=JSON.stringify(template),r=prepare(current,template,meta);
 assert.equal(r.nodes[0].credentials.postgres.id,'fake-db');
 assert.equal(r.nodes[1].parameters.path,'private-fixture');assert.equal(r.nodes[1].webhookId,'fake-hook');
 assert.equal(r.nodes[2].parameters.url,'https://fixture.example.invalid/send');
 assert.equal(r.nodes[2].parameters.options.timeout,30000);
 assert.equal(r.nodes[3].parameters.documentId.value,'fake-sheet');
 assert.equal(r.active,false);assert.equal(JSON.stringify(template),before);
});
test('Versão divergente e credencial ausente impedem a preparação',()=>{
 assert.throws(()=>prepare({...current,versionId:'v2'},template,meta),/Versão/);
 assert.throws(()=>prepare({...current,nodes:current.nodes.filter(n=>n.id!=='db')},template,meta),/PostgreSQL/);
});
test('Base V2 tem delimitadores e preserva dados desconhecidos',()=>{
 const s=read('conhecimento/continuidade-pausa-v2.md');
 assert(s.includes('ANA_CONTINUIDADE_V2_INICIO')&&s.includes('ANA_CONTINUIDADE_V2_FIM'));
 assert(s.includes('omita campos desconhecidos'));
});
test('Registro distingue preparação de implantação',()=>{
 const r=JSON.parse(read('conhecimento/implantacao-2026-10-14.json'));
 assert.equal(r.production_deployed,false);assert.equal(r.ana_config_updated,false);assert.equal(r.patient_messages_sent,0);
});
console.log(JSON.stringify({publication_checks:total,passed:total}));
