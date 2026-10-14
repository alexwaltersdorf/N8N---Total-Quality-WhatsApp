const fs=require('fs'),path=require('path');
const copy=x=>JSON.parse(JSON.stringify(x));
function prepare(current,template,meta){
 if(current.id!==meta.workflow_id||current.versionId!==meta.baseline_version_id)throw new Error('Versão de origem diferente: exporte e revise as alterações atuais antes de atualizar.');
 const pg=current.nodes.find(n=>n.type==='n8n-nodes-base.postgres'&&n.credentials)?.credentials;
 if(!pg)throw new Error('Credencial PostgreSQL ausente no export privado.');
 const nodes=template.nodes.map(t=>{
  const n=copy(t),old=current.nodes.find(x=>x.id===t.id)||current.nodes.find(x=>x.name===t.name);
  if(old?.credentials)n.credentials=copy(old.credentials);
  else if(n.type==='n8n-nodes-base.postgres')n.credentials=copy(pg);
  if(n.type==='n8n-nodes-base.webhook'){
   if(!old?.parameters.path)throw new Error('Webhook original ausente.');
   n.parameters.path=old.parameters.path;
   if(old.webhookId)n.webhookId=old.webhookId;
   for(const k of ['authentication','options'])if(old.parameters[k]!==undefined)n.parameters[k]=copy(old.parameters[k]);
  }
  if(n.type==='n8n-nodes-base.googleSheets'){
   if(!old)throw new Error('Planilha original ausente.');
   for(const k of ['documentId','sheetName'])if(old.parameters[k]!==undefined)n.parameters[k]=copy(old.parameters[k]);
  }
  if(n.type==='n8n-nodes-base.httpRequest'&&old){
   for(const k of ['url','authentication','nodeCredentialType','genericAuthType','sendHeaders','headerParameters']){
    if(old.parameters[k]!==undefined)n.parameters[k]=copy(old.parameters[k]);
   }
  }
  return n;
 });
 if(JSON.stringify(nodes).includes('RECONFIGURAR_'))throw new Error('Configuração privada incompleta.');
 return {id:current.id,name:current.name,active:false,nodes,connections:copy(template.connections),settings:{...current.settings,...template.settings},pinData:{}};
}
module.exports={prepare};
if(require.main===module){
 const [input,output]=process.argv.slice(2);
 if(!input||!output)throw new Error('Uso: node scripts/preparar-atualizacao.cjs export-privado.json destino-privado.json');
 const root=path.resolve(__dirname,'..'),dest=path.resolve(output),rel=path.relative(root,dest);
 if(!rel.startsWith('..')&&!path.isAbsolute(rel)&&!rel.startsWith('private'+path.sep))throw new Error('Dentro do repositório, salve somente em private/ (ignorado pelo Git).');
 const read=f=>JSON.parse(fs.readFileSync(f,'utf8').replace(/^\uFEFF/,''));
 const current=read(input),manifest=read(path.join(root,'workflows/manifesto.json'));
 const entry=Object.entries(manifest.workflows).find(([,m])=>m.workflow_id===current.id);
 if(!entry)throw new Error('Fluxo não previsto no manifesto.');
 const result=prepare(current,read(path.join(root,'workflows',entry[0])),entry[1]);
 fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({prepared:true,id:result.id,active:false,deployed:false}));
}
