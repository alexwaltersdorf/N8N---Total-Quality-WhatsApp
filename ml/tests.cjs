'use strict';
const assert=require('node:assert/strict'),ml=require('./core.cjs');
let passed=0;const test=(name,f)=>{f();passed++;console.log('PASS '+name);};
function session(i,kind=0){return {session_id:'s'+(i+1),first_message_id:String(i+1),day:'2026-09-'+String(1+i%20).padStart(2,'0'),source_updated_at:'2026-09-30T10:00:00Z',user_count:kind?15+i%4:1+i%3,bot_count:kind?12+i%3:2,human_count:kind?3:0,repeated_user:kind?3:0,friction_count:kind?4:0,human_request:kind?2:0,knowledge_gap:kind?3:0,median_reply_minutes:kind?50+i%12:1+i%2,reply_pairs:2,unanswered:!!kind,bot_ativo:true,topic_price:1};}
const sessions=Array.from({length:160},(_,i)=>session(i,i%2));
const input={today:'2026-10-12',collected_at:'2026-10-12T16:00:00Z',window_days:90,source_messages:1200,eligible_sessions:sessions.length,sessions};
let trained;
test('treina K-Means com partição em dias diferentes',()=>{trained=ml.run(input);assert.equal(trained.model.status,'treinado');assert(trained.model.trained_through<trained.model.validation_from);assert(trained.model.train_sessions>30);assert(trained.model.train_silhouette>.5);});
test('resultado determinístico',()=>assert.deepEqual(ml.run(input),trained));
test('reutiliza modelo do dia sem treinar novamente',()=>assert.deepEqual(ml.run({...input,model:trained.model}).model,trained.model));
test('amostra pequena não fabrica modelo',()=>assert.equal(ml.run({...input,sessions:sessions.slice(0,12)}).model,null));
test('sem variação não inventa grupos',()=>{const flat=sessions.map((s,i)=>({...session(0),session_id:s.session_id,first_message_id:s.first_message_id,day:s.day}));assert.equal(ml.run({...input,sessions:flat}).model,null);});
test('detecta padrão extremo fora dos centros',()=>{const out={...session(999),user_count:90000,bot_count:90000,human_count:1000,median_reply_minutes:1440};const r=ml.run({...input,model:trained.model,sessions:[out]});assert.equal(r.sessions[0].anomaly,true);assert.equal(r.sessions[0].analise_ml.envio_automatico,false);});
test('silhouette padrão tem valor numérico correto',()=>assert(Math.abs(ml.silhouette([[0],[1],[10],[11]],[0,0,1,1])-0.899749373433584)<1e-10));
test('opt-out real bloqueia recomendação de contato',()=>{const s=ml.analyse({...session(1),opt_out:true},null,null);assert.equal(s.sugestao_followup,'NAO_CONTACTAR');});
test('strings false não viram booleanos verdadeiros',()=>{const s=ml.analyse({...session(1),opt_out:'false',escalado:'false'},null,null);assert.equal(s.sugestao_followup,'SOMENTE_OBSERVAR');});
test('bot pausado e escalonamento aguardam equipe',()=>{assert.equal(ml.analyse({...session(1),bot_ativo:false},null,null).sugestao_followup,'AGUARDAR_EQUIPE');assert.equal(ml.analyse({...session(1),escalado:true},null,null).sugestao_followup,'AGUARDAR_EQUIPE');});
test('score e anomalia não acionam mensagens ou edição de prompt',()=>{for(const s of trained.sessions){assert.equal(s.analise_ml.envio_automatico,false);assert.equal(s.analise_ml.alterar_prompt_automaticamente,false);assert(s.priority>=0&&s.priority<=100);}});
test('modelo não contém identificadores ou texto de conversa',()=>{assert(!JSON.stringify(trained.model).includes('session_id'));assert(!JSON.stringify(trained).includes('conteudo'));});
test('duas linhas com a mesma unidade são rejeitadas',()=>assert.throws(()=>ml.run({...input,sessions:[sessions[0],sessions[0]]}),/duplicadas/));
test('NaN e strings numéricas são rejeitados',()=>{assert.throws(()=>ml.run({...input,sessions:[{...session(0),user_count:NaN}]}),/Feature/);assert.throws(()=>ml.run({...input,sessions:[{...session(0),user_count:'2'}]}),/Feature/);});
test('HTML escapa conteúdo livre',()=>{const x=ml.html({...trained.summary,retraining_note:'<script>alert(1)</script>'});assert(!x.includes('<script>'));assert(x.includes('&lt;script&gt;'));});
test('modelo com escala inválida é rejeitado',()=>assert.equal(ml.validModel({...trained.model,scaler:{center:[],scale:[]}}),false));
const {aggregateDemand,dashboardHTML}=require('./dashboard.cjs');
const demand={date_min:'2026-10-01',date_max:'2026-10-03',dictionary_size:3,as_of:'2026-10-03T12:00:00Z',rows:[
 {date:'2026-10-01',source:'mensagem_cliente',level:'category',kind:'Exame',service:'Laboratorial',category:'Laboratorial',count:2},
 {date:'2026-10-03',source:'mensagem_cliente',level:'category',kind:'Consulta',service:'Clínica geral',category:'Clínica geral',count:3},
 {date:'2026-10-01',source:'estrutura_ana',level:'category',kind:'Exame',service:'Laboratorial',category:'Laboratorial',count:9},
 {date:'2026-10-01',source:'mensagem_cliente',level:'service',kind:'Exame',service:'Hemograma',category:'Laboratorial',count:2},
 {date:'2026-10-01',source:'mensagem_cliente',level:'service',kind:'Exame',service:'TGO / AST',category:'Laboratorial',count:2}
],coverage:[]};
const df={from:demand.date_min,to:demand.date_max,source:'mensagem_cliente'};
test('datas inclusivas e dias sem procura',()=>{const r=aggregateDemand(demand,df);assert.equal(r.total,5);assert.deepEqual(r.series.map(x=>x.count),[2,0,3]);});
test('fontes alternativas não se somam',()=>assert.equal(aggregateDemand(demand,{...df,source:'estrutura_ana'}).total,9));
test('Laboratorial usa categoria deduplicada e preserva detalhes',()=>{assert.equal(aggregateDemand(demand,{...df,kind:'Exame'}).total,2);assert.equal(aggregateDemand(demand,{...df,level:'service',query:'Laboratorial'}).total,4);});
test('busca ignora acentos e filtro Consulta não mistura exames',()=>{const r=aggregateDemand(demand,{...df,kind:'Consulta',query:'clinica'});assert.equal(r.total,3);assert.equal(r.exams,0);});
test('período invertido rejeitado e vazio não inventa dados',()=>{assert(aggregateDemand(demand,{...df,from:'2026-10-04'}).error);assert.equal(aggregateDemand(demand,{...df,from:'2026-10-02',to:'2026-10-02'}).total,0);});
test('dashboard não permite fechar script via dados',()=>{const h=dashboardHTML({...demand,rows:[{...demand.rows[0],service:'</script><img src=x onerror=alert(1)>'}]});assert(!h.includes('</script><img'));assert(h.includes('\\u003c/script>'));});
test('código n8n incorpora dashboard funcional no relatório',()=>{const fs=require('node:fs'),vm=require('node:vm');const w=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'workflow-ana-ml.json'),'utf8'));const code=w.nodes.find(n=>n.name==='Treinar e pontuar ML').parameters.jsCode;const result=vm.runInNewContext('(function(){'+code+'})()',{$input:{first:()=>({json:{dataset:{...input,demand}}})}});assert(result[0].json.report_html.includes('id="ana-demand"'));assert(result[0].json.report_html.includes('Laboratorial'));});
console.log(JSON.stringify({passed,model_k:trained.model.k,train_silhouette:trained.model.train_silhouette,holdout_silhouette:trained.model.holdout_silhouette}));
