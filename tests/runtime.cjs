const fs=require('fs'),path=require('path'),assert=require('assert/strict');
const {PGlite}=require('@electric-sql/pglite');
const out=path.resolve(__dirname,'..');
const read=f=>fs.readFileSync(path.join(out,f==='00-migracao.sql'?'runtime/database.sql':'workflows/'+f),'utf8').replace(/^\uFEFF/,'');
const flows=fs.readdirSync(path.join(out,'workflows')).filter(f=>f.endsWith('.json')&&/^(01-|02-|06-|BV-)/.test(f)).map(f=>JSON.parse(read(f)));
const a=flows.find(w=>w.name.startsWith('ANA — 01')),c=flows.find(w=>w.name.startsWith('ANA-06')),fu=flows.find(w=>w.name.startsWith('ANA — 02')),bv=flows.find(w=>w.name.startsWith('BV-01'));
const node=(w,name)=>w.nodes.find(n=>n.name===name);
const checks=[];
async function test(name,fn){await fn();checks.push({name,passed:true});}
const pg=new PGlite();
const base="551199999";
let seq=1000;
function phone(){return base+(++seq);}
const call=async(name,p)=>(await pg.query('SELECT '+name+'($1::jsonb) AS r',[JSON.stringify(p)])).rows[0].r;
async function lead(p=phone(),extra={}){
 await pg.query("INSERT INTO ana_leads(phone,bot_ativo,opt_out) VALUES($1,true,false)",[p]);
 for(const [key,val] of Object.entries(extra))await pg.query('UPDATE ana_leads SET '+key+'=$2 WHERE phone=$1',[p,val]);
 return p;
}
async function input(p,id='U'+(++seq)){
 await pg.query("INSERT INTO ana_mensagens(phone,role,tipo,conteudo,message_id) VALUES($1,'user','texto','Quero ajuda',$2)",[p,id]);
 return id;
}
function payload(p,extra={}){return {phone:p,owner:'run1',send_key:'test:'+p,origin:'ANA-01',texto:'Resposta de teste '+p,...extra}}
async function finish(p,extra={}){return call('ana_runtime_finish',{send_key:p.send_key,owner:p.owner,status_code:201,provider_id:'OUT'+(++seq),error:false,...extra})}
function run(w,name,data={},refs={}){
 const accessor=n=>({first:()=>({json:refs[n]?.[0]||refs[n]||{}}),all:()=>Array.isArray(refs[n])?refs[n].map(json=>({json})):[{json:refs[n]||{}}],item:{json:refs[n]?.[0]||refs[n]||{}}});
 const items=Array.isArray(data)?data.map(json=>({json})):[{json:data}];
 return new Function('$json','$input','$','$env','$execution',node(w,name).parameters.jsCode)(items[0].json,{all:()=>items,first:()=>items[0]},accessor,{EVOLUTION_INSTANCE:'test'},{id:'test-run'});
}
(async()=>{
await pg.exec("CREATE TABLE ana_leads(phone text PRIMARY KEY,nome text,bot_ativo boolean DEFAULT true,opt_out boolean DEFAULT false,human_msg_at timestamptz,escalado boolean DEFAULT false,followup_due_at timestamptz,followup_step int DEFAULT 0,last_patient_msg_at timestamptz,last_bot_msg_at timestamptz,updated_at timestamptz DEFAULT now(),agendamento jsonb,proxima_acao text,temperatura text,funil text,consciencia int,intencao text,exames jsonb,convenio text,motivo_escalada text,resumo_interno text); CREATE TABLE ana_mensagens(id bigserial PRIMARY KEY,phone text,role text,tipo text,conteudo text,message_id text,dados jsonb,created_at timestamptz DEFAULT now());CREATE UNIQUE INDEX msg_id ON ana_mensagens(message_id) WHERE message_id IS NOT NULL;CREATE TABLE ana_envios_log(phone text,tipo text,enviado_em timestamptz DEFAULT now());CREATE TABLE ana_config(chave text PRIMARY KEY,valor text);");
await pg.exec('CREATE ROLE anon; CREATE ROLE authenticated;');
await test('Migração e reaplicação idempotente no PostgreSQL embarcado',async()=>{await pg.exec(read('00-migracao.sql'));await pg.exec(read('00-migracao.sql'));});
await test('Tabelas privadas têm RLS e sem leitura por anon/authenticated',async()=>{
 for(const t of ['ana_runtime_outbox','ana_runtime_observed','ana_runtime_kb','ana_runtime_audit','tq_boasvindas_enviadas']){
  assert((await pg.query('SELECT relrowsecurity FROM pg_class WHERE relname=$1',[t])).rows[0].relrowsecurity);
  for(const r of ['anon','authenticated'])assert.equal((await pg.query("SELECT has_table_privilege($1,$2,'SELECT') AS allowed",[r,t])).rows[0].allowed,false);
 }
});
await test('Funções de envio não são executáveis por anon/authenticated',async()=>{
 for(const f of ['ana_runtime_claim','ana_runtime_finish','ana_runtime_observe','ana_runtime_resolve_human']){
  for(const r of ['anon','authenticated'])assert.equal((await pg.query("SELECT has_function_privilege($1,$2,'EXECUTE') AS allowed",[r,f+'(jsonb)'])).rows[0].allowed,false);
 }
});
await test('Sintaxe JS e conexões dos quatro fluxos',()=>{
 for(const w of flows){const names=new Set(w.nodes.map(n=>n.name));assert.equal(names.size,w.nodes.length);for(const [name,cs] of Object.entries(w.connections)){assert(names.has(name),name);for(const bs of cs.main||[])for(const edge of bs)assert(names.has(edge.node),edge.node);}
 for(const nn of w.nodes)if(nn.type==='n8n-nodes-base.code')new Function('$json','$input','$',nn.parameters.jsCode);
 assert.equal(w.active,false);
 }
});
await test('Mensagem humana sem source também segue para pausa',()=>{
 const x=run(a,'Filtrar Eventos',{body:{event:'messages.upsert',data:{key:{id:'H1',fromMe:true,remoteJid:'5511999990001@s.whatsapp.net'},message:{conversation:'Bom dia'}}}});assert.equal(x[0].json.humano,true);assert.equal(x[0].json.messageId,'H1');
});
await test('ID ausente falha fechado e LID sem telefone não dispara',()=>{
 assert.throws(()=>run(a,'Filtrar Eventos',{data:{key:{remoteJid:'5511999990001@s.whatsapp.net'},message:{conversation:'Oi'}}}),/messageId/);
 assert.equal(run(a,'Filtrar Eventos',{data:{key:{id:'X',remoteJid:'123456@lid'},message:{conversation:'Oi'}}}).length,0);
});
await test('LID usa remoteJidAlt de telefone; fromMe textual é reconhecido',()=>{
 const x=run(a,'Filtrar Eventos',{data:{key:{id:'X',fromMe:'true',remoteJid:'123456@lid',remoteJidAlt:'5511999990001@s.whatsapp.net'},message:{conversation:'Olá'}}});assert.equal(x[0].json.phone,'5511999990001');assert(x[0].json.humano);
});
await test('Mesma intenção de envio é reservada uma única vez',async()=>{
 const p=payload(await lead());assert((await call('ana_runtime_claim',p)).allowed);
 assert.equal((await call('ana_runtime_claim',{...p,owner:'run2',texto:'Outro texto'})).reason,'duplicate_event');
 assert.equal((await pg.query('SELECT count(*)::int n FROM ana_runtime_outbox WHERE phone=$1',[p.phone])).rows[0].n,1);
});
await test('Sucesso requer código 2xx e ID e só então grava histórico',async()=>{
 const p=payload(await lead());await call('ana_runtime_claim',p);
 assert.equal((await pg.query('SELECT count(*)::int n FROM ana_mensagens WHERE phone=$1',[p.phone])).rows[0].n,0);
 assert((await finish(p)).accepted);
 assert.equal((await pg.query('SELECT count(*)::int n FROM ana_mensagens WHERE phone=$1',[p.phone])).rows[0].n,1);
 assert.equal((await finish(p)).accepted,false);
});
await test('Timeout fica incerto e bloqueia reenvio automático',async()=>{
 const p=payload(await lead());await call('ana_runtime_claim',p);assert.equal((await finish(p,{status_code:0,provider_id:''})).status,'unknown');
 assert.equal((await call('ana_runtime_claim',{...p,send_key:p.send_key+'next'})).reason,'send_in_progress_or_uncertain');
 assert.equal((await pg.query('SELECT count(*)::int n FROM ana_mensagens WHERE phone=$1',[p.phone])).rows[0].n,0);
});
await test('2xx sem ID não é sucesso; execução diferente não finaliza reserva',async()=>{
 const p=payload(await lead());await call('ana_runtime_claim',p);
 assert.equal((await finish(p,{owner:'other'})).reason,'already_finished_or_wrong_owner');
 assert.equal((await finish(p,{status_code:200,provider_id:''})).status,'unknown');
});
await test('Mensagem humana pendente bloqueia envio imediatamente',async()=>{
 const p=payload(await lead());await call('ana_runtime_observe',{phone:p.phone,messageId:'H2',conteudo:'Recepção',source:'web'});
 assert.equal((await call('ana_runtime_claim',p)).reason,'human_event_pending');
 assert((await call('ana_runtime_resolve_human',{phone:p.phone,messageId:'H2'})).paused);
 assert.equal((await call('ana_runtime_claim',p)).reason,'human_or_bot_paused');
});
await test('Atendente no primeiro contato cria lead pausado',async()=>{
 const p=phone();await call('ana_runtime_observe',{phone:p,messageId:'HFIRST'});
 await call('ana_runtime_resolve_human',{phone:p,messageId:'HFIRST'});
 assert.equal((await pg.query('SELECT bot_ativo FROM ana_leads WHERE phone=$1',[p])).rows[0].bot_ativo,false);
});
await test('Eco confirmado pelo ID não pausa a IA',async()=>{
 const p=payload(await lead());await call('ana_runtime_claim',p);await finish(p,{provider_id:'ECHO1'});
 await call('ana_runtime_observe',{phone:p.phone,messageId:'ECHO1',source:'web'});
 assert.equal((await call('ana_runtime_resolve_human',{phone:p.phone,messageId:'ECHO1'})).paused,false);
 assert.equal((await pg.query('SELECT bot_ativo FROM ana_leads WHERE phone=$1',[p.phone])).rows[0].bot_ativo,true);
});
await test('Eco antes da resposta HTTP bloqueia temporariamente e é reconhecido após o recibo',async()=>{
 const p=payload(await lead());await call('ana_runtime_claim',p);
 await call('ana_runtime_observe',{phone:p.phone,messageId:'EARLY1',source:'unknown'});
 assert.equal((await call('ana_runtime_claim',{...p,send_key:'other'+p.send_key})).reason,'human_event_pending');
 await finish(p,{provider_id:'EARLY1'});
 assert.equal((await call('ana_runtime_resolve_human',{phone:p.phone,messageId:'EARLY1'})).paused,false);
});
await test('Texto humano igual ao do bot não é confundido com eco',async()=>{
 const p=payload(await lead());await call('ana_runtime_claim',p);await finish(p);
 await call('ana_runtime_observe',{phone:p.phone,messageId:'Hsame',conteudo:p.texto,source:'web'});
 assert((await call('ana_runtime_resolve_human',{phone:p.phone,messageId:'Hsame'})).paused);
});
await test('Paciente voltar a escrever não reativa bot pausado',async()=>{
 const p=await lead(undefined,{bot_ativo:false});
 await pg.query(node(a,'Upsert Lead').parameters.query,[JSON.stringify({phone:p,pushName:'Fictício'})]);
 assert.equal((await pg.query('SELECT bot_ativo FROM ana_leads WHERE phone=$1',[p])).rows[0].bot_ativo,false);
});
await test('Resposta de turno antigo é bloqueada',async()=>{
 const p=await lead();await input(p,'NEWINPUT');assert.equal((await call('ana_runtime_claim',payload(p,{input_id:'OLDINPUT'}))).reason,'stale_input');
});
await test('Opt-out bloqueia os quatro tipos de remetente',async()=>{
 const p=await lead(undefined,{opt_out:true});for(const origin of ['ANA-01','ANA-02','ANA-06','BV-01'])assert.equal((await call('ana_runtime_claim',payload(p,{origin}))).reason,'opt_out');
});
await test('Deduplicação de texto normaliza espaços e caixa, permitindo repetição explicitamente pedida',async()=>{
 const p=payload(await lead(),{texto:'Olá   paciente'});await call('ana_runtime_claim',p);await finish(p);
 assert.equal((await call('ana_runtime_claim',{...p,send_key:'next'+p.send_key,texto:'olá paciente'})).reason,'duplicate_content');
 assert((await call('ana_runtime_claim',{...p,send_key:'repeat'+p.send_key,texto:'olá paciente',allow_repeat:true})).allowed);
});
await test('Novo contato torna follow-up antigo inelegível',async()=>{
 const p=await lead(undefined,{last_patient_msg_at:'2026-10-13T12:00:00Z'});assert.equal((await call('ana_runtime_claim',payload(p,{origin:'ANA-02',patient_snapshot:'2026-10-12T12:00:00Z'}))).reason,'new_patient_message');
});
await test('Compromisso alterado bloqueia lembrete enfileirado',async()=>{
 const p=await lead(undefined,{agendamento:JSON.stringify({status:'confirmado',origem:'google_agenda',data:'2026-10-15',hora:'10:00'})});
 assert.equal((await call('ana_runtime_claim',payload(p,{origin:'ANA-06',appointment_date:'2026-10-14',appointment_time:'10:00'}))).reason,'appointment_changed');
});
await test('Boas-vindas não envia para conversa já iniciada',async()=>{
 const p=await lead();await input(p);assert.equal((await call('ana_runtime_claim',payload(p,{origin:'BV-01'}))).reason,'conversation_already_started');
});
await test('No máximo uma mensagem proativa aceita por paciente no dia',async()=>{
 const p=payload(await lead(),{origin:'ANA-02'});await call('ana_runtime_claim',p);await finish(p);
 assert.equal((await call('ana_runtime_claim',{...p,send_key:'new'+p.send_key,texto:'Outro lembrete'})).reason,'proactive_already_sent_today');
});

function extract(raw,leadData={},text='Gostaria de saber o preço'){
 return run(a,'Extrair Resposta',{status:'completed',output:[{content:[{type:'output_text',text:raw}]}]},
 {'Montar Payload':{phone:'5511999990001'},'Upsert Lead':leadData,'Filtrar Eventos':{messageId:'IN1',texto:text},'Carregar Histórico':[]})[0].json;
}
await test('JSON inválido provoca transferência; string false não ativa flags',()=>{
 const x=extract('Resposta sem contrato');assert(x.dados.escalar);assert(x.pausar);
 const y=extract('Olá\n###DADOS###{"escalar":"false","opt_out":"false"}');assert.equal(y.dados.escalar,false);assert.equal(y.dados.opt_out,false);
});
await test('Opt-out persistente não é apagado pelo modelo',()=>{
 assert(extract('Olá\n###DADOS###{"opt_out":false}',{opt_out:true}).dados.opt_out);
});
await test('Pedido de humano e parar têm decisões determinísticas',()=>{
 const h=extract('Tudo certo\n###DADOS###{}',{},'Quero falar com uma atendente');assert(h.pausar);assert(h.dados.escalar);
 const stop=extract('Vamos agendar\n###DADOS###{}',{},'parar');assert(stop.pausar);assert(stop.dados.opt_out);assert.equal(stop.dados.proxima_acao,'encerrar');
});
await test('Campos omitidos não apagam convênio, exames ou agendamento',()=>{
 const x=extract('Certo\n###DADOS###{}');const p=JSON.parse(x.pg_lead);assert(!('convenio' in p));assert(!('exames' in p));assert(!('agendamento' in p));
});
await test('Silêncio válido não gera bolhas; parágrafos idênticos são removidos',()=>{
 assert.equal(extract('###DADOS###{"proxima_acao":"encerrar"}').mensagem,'');
 assert.equal(extract('Oi!\n\nOi!\n###DADOS###{}').mensagem,'Oi!');
});
await test('Atualização preserva agenda real e não grava horário fictício da IA',async()=>{
 const p=await lead(undefined,{agendamento:JSON.stringify({status:'confirmado',data:'2026-10-17',hora:'10:00'}),convenio:'Convênio fictício',exames:JSON.stringify(['Exame fictício'])});
 const id=await input(p);
 const r=await pg.query(node(a,'Atualizar Lead').parameters.query,[JSON.stringify({phone:p,input_id:id,human_snapshot:null,opt_out:false,pausar:false,agendamento:{status:'nenhum'}})]);
 assert.equal(r.rows[0].applied,1);
 const l=(await pg.query('SELECT * FROM ana_leads WHERE phone=$1',[p])).rows[0];assert.equal(l.agendamento.status,'confirmado');assert.equal(l.convenio,'Convênio fictício');assert.equal(l.last_bot_msg_at,null);
});
await test('CAS impede que uma resposta já preparada sobrescreva atendimento humano',async()=>{
 const p=await lead(),id=await input(p);
 await call('ana_runtime_observe',{phone:p,messageId:'HCAS'});
 const r=await pg.query(node(a,'Atualizar Lead').parameters.query,[JSON.stringify({phone:p,input_id:id,human_snapshot:null,pausar:false,convenio:'Errado'})]);
 assert.equal(r.rows[0].applied,0);
});
await test('Consulta de prompt e de base aprovada executa sem dados clínicos fictícios',async()=>{
 await pg.query("INSERT INTO ana_config(chave,valor) VALUES('system_prompt','Base de teste')");
 const r=await pg.query(node(a,'Carregar System Prompt').parameters.query);assert.equal(r.rows[0].valor,'Base de teste');assert.equal(r.rows[0].kb,'');
});
await test('Base de conhecimento exige fonte, responsável e revisão para aprovar',async()=>{
 await assert.rejects(()=>pg.query("INSERT INTO ana_runtime_kb(key,content,status) VALUES('teste','não publicado','approved')"));
 await pg.query("INSERT INTO ana_runtime_kb(key,content,status) VALUES('rascunho','rascunho de teste','draft')");
 assert.equal((await pg.query(node(a,'Carregar System Prompt').parameters.query)).rows[0].kb,'');
});
await test('Preço e imagem: pedido ilegível não vira orçamento',()=>{
 const r=run(a,'Normalizar Imagem',{output:[{content:[{type:'output_text',text:JSON.stringify({legivel:false,exames:['Exame A'],observacoes:''})}]}]},{'Filtrar Eventos':{phone:'5511999990001',messageId:'M1'}});
 assert(!r[0].json.texto_para_ia.includes('use consultar_precos'));
});
await test('ANA-06 mantém skip como item para continuar o loop',()=>{
 const r=run(c,'Montar mensagem',{phone:'5511999990001',evento:'CANCELADO',data:'2026-10-14',hora:'09:00',nome:'Pessoa Fictícia',paciente:'Pessoa Fictícia'});
 assert.equal(r.length,1);assert.equal(r[0].json.skip,true);
});
await test('ANA-06 aceita teste ergométrico e rejeita horário 09:99 na guarda de validade',()=>{
 const r=run(c,'Montar mensagem',{phone:'5511999990001',evento:'09:00 - Pessoa Fictícia - TESTE ERGOMETRICO',data:'2026-10-14',hora:'09:00',nome:'Pessoa Fictícia',paciente:'Pessoa Fictícia'});
 assert(r[0].json.texto);
 const cond=node(c,'Lembrete válido?').parameters.conditions.conditions[0].leftValue.slice(3,-2);
 const evalCond=new Function('$json','return ('+cond+')');
 assert.equal(evalCond({...r[0].json,hora:'09:99'}),false);assert.equal(evalCond(r[0].json),true);
});
await test('BV seleciona depois de excluir envios anteriores, evitando bloqueio dos primeiros 10',async()=>{
 const candidates=[];
 for(let i=0;i<15;i++){const p=phone();candidates.push({telefone:p,nome:'Pessoa',horarioPermitido:true});if(i<10)await pg.query("INSERT INTO tq_boasvindas_enviadas(telefone) VALUES($1)",[p]);}
 const r=await pg.query(node(bv,'Selecionar pendentes após deduplicar').parameters.query,[JSON.stringify({candidates})]);
 assert.equal(r.rows.length,5);
 assert.equal(r.rows[0].candidate.telefone,candidates[10].telefone);
});
await test('ANA-02 só avança datas se o paciente não respondeu durante o envio',async()=>{
 const p=await lead(undefined,{last_patient_msg_at:'2026-10-13T15:00:00Z'});
 const r=await pg.query(node(fu,'Atualizar Lead FU').parameters.query,[JSON.stringify({phone:p,patient_snapshot:'2026-10-12T15:00:00Z',followup_due:'2026-10-20T15:00:00Z'})]);
 assert.equal(r.rows[0].applied,0);
});
await test('Registro ANA-06 não insere a mesma mensagem novamente no histórico',async()=>{
 const p=await lead(undefined,{agendamento:JSON.stringify({status:'confirmado',origem:'google_agenda',data:'2026-10-14',hora:'09:00'})});
 await pg.query(node(c,'Registrar envio').parameters.query,[JSON.stringify({phone:p,data:'2026-10-14',hora:'09:00'})]);
 assert.equal((await pg.query('SELECT count(*)::int n FROM ana_mensagens WHERE phone=$1',[p])).rows[0].n,0);
 assert((await pg.query('SELECT agendamento FROM ana_leads WHERE phone=$1',[p])).rows[0].agendamento.confirmacao_enviada_em);
});
await test('Todos os envios ao paciente passam por trava e não têm retry cego',()=>{
 for(const [w,name] of [[a,'Enviar Mensagem'],[fu,'Enviar Follow-up'],[c,'Enviar pelo WhatsApp (Evolution)'],[bv,'Enviar boas-vindas (Evolution)']]){
 assert.equal(w.connections['Envio autorizado?'].main[0][0].node,name);
 assert.equal(node(w,name).retryOnFail,false);assert(node(w,name).parameters.options.response.response.fullResponse);
 assert(node(w,name).parameters.jsonBody.includes('delay: 0'));
 }
});
await test('Corpo da resposta HTTP é passado com status explícito ao registrador',()=>{
 const expr=node(a,'Registrar resultado do envio').parameters.options.queryReplacement.slice(3,-2);
 const ev=new Function('$json','$','$execution','return ('+expr+')');
 const args=ev({statusCode:201,body:{key:{id:'EV1'}}},()=>({item:{json:{guard:{payload:{send_key:'K',owner:'O'}}}}}),{id:'T'});
 const p=JSON.parse(args[0]);assert.equal(p.provider_id,'EV1');assert.equal(p.status_code,201);assert.equal(p.error,false);
});
await test('Payload carrega política, histórico humano, base aprovada e impede chamadas paralelas de preço',()=>{
 const refs={'Carregar Histórico':[{role:'assistant',tipo:'humano',conteudo:'Já estou verificando'},{role:'user',conteudo:'Obrigado'}],'Carregar System Prompt':{valor:'Base original',kb:'Fato aprovado de teste'},'Upsert Lead':{phone:'5511999990001'}};
 const b=run(a,'Montar Payload',{},refs)[0].json.openai_body;
 assert(b.instructions.includes('Continuidade, não repetição'));assert(b.instructions.includes('Fato aprovado de teste'));assert.equal(b.parallel_tool_calls,false);assert(b.input.some(m=>m.content.includes('[Equipe humana]')));
 refs['Carregar System Prompt'].valor='Base original\n'+fs.readFileSync(path.join(out,'conhecimento/continuidade-pausa-v2.md'),'utf8');
 const b2=run(a,'Montar Payload',{},refs)[0].json.openai_body;
 assert.equal((b2.instructions.match(/# Continuidade, não repetição/g)||[]).length,1);
 assert(b2.instructions.includes('Base original'));
 assert(!b2.instructions.includes('\\n'));

});
const result={generated_at:new Date().toISOString(),engine:'PGlite 0.5.9; PostgreSQL embarcado; esquema mínimo inferido dos exports',scope:'JS de nós, SQL real e grafo. Não substitui n8n/Evolution nem teste concorrente multiconexão.',passed:checks.length,checks};
fs.mkdirSync(path.join(out,'tests/results'),{recursive:true});fs.writeFileSync(path.join(out,'tests/results/runtime.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({passed:checks.length,engine:result.engine}));
await pg.close();
})().catch(e=>{console.error(e);process.exit(1);});
