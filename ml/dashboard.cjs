'use strict';
function aggregateDemand(data,filters) {
 const {from,to,source,kind='Todos',query='',level='category'}=filters;
 if(!from||!to||from>to)return {error:'Escolha uma data inicial menor ou igual à final.',total:0,ranking:[],series:[]};
 const norm=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const rows=(data.rows||[]).filter(r=>r.level===level&&r.source===source&&r.date>=from&&r.date<=to&&(kind==='Todos'||r.kind===kind)&&(norm(r.service).includes(norm(query))||norm(r.category).includes(norm(query))));
 const map=new Map(),days=new Map();let total=0,exams=0,consultations=0;
 for(const r of rows){if(!Number.isFinite(r.count)||r.count<0)throw Error('Contagem inválida');const key=r.kind+'|'+r.service;const v=map.get(key)||{kind:r.kind,service:r.service,count:0};v.count+=r.count;map.set(key,v);total+=r.count;days.set(r.date,(days.get(r.date)||0)+r.count);if(r.kind==='Exame')exams+=r.count;else consultations+=r.count;}
 const ranking=[...map.values()].sort((a,b)=>b.count-a.count||a.service.localeCompare(b.service,'pt-BR'));
 const coverage=(data.coverage||[]).filter(r=>r.source===source&&r.day>=from&&r.day<=to).reduce((a,r)=>({contact_days:a.contact_days+r.contact_days,matched:a.matched+r.matched_contact_days,observations:a.observations+r.observations,unmatched:a.unmatched+r.unmatched_observations}),{contact_days:0,matched:0,observations:0,unmatched:0});
 const series=[];let day=new Date(from+'T12:00:00Z'),end=new Date(to+'T12:00:00Z');for(let n=0;day<=end&&n<370;n++,day.setUTCDate(day.getUTCDate()+1)){const date=day.toISOString().slice(0,10);series.push({date,count:days.get(date)||0});}
 return {total,exams,consultations,ranking,series,coverage};
}
function demandClient(data) {
 const root=document.getElementById('ana-demand');
 const by=id=>root.querySelector('[data-demand="'+id+'"]');
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=n=>new Intl.NumberFormat('pt-BR').format(n);
 let latest=null;
 function render(){
  const filters={from:by('from').value,to:by('to').value,source:by('source').value,kind:by('kind').value,query:by('search').value,level:by('level').value};
  latest=aggregateDemand(data,filters);
  by('status').textContent=latest.error||(!latest.total?'Nenhuma menção identificada com esses filtros.':'Filtros aplicados: '+fmt(latest.total)+' ocorrências de procura identificadas.');
  if(latest.error){for(const id of ['ranking','trend','metrics','table','daily','leader','coverage'])by(id).textContent='';return;}
  const top=latest.ranking[0];
  by('metrics').innerHTML=[['Ocorrências de procura',fmt(latest.total)],['Exames',fmt(latest.exams)],['Consultas',fmt(latest.consultations)],['Serviços identificados',fmt(latest.ranking.length)]].map(([k,v])=>'<div class="dm-card"><strong>'+v+'</strong><span>'+k+'</span></div>').join('');
  by('leader').textContent=top?top.service+' lidera este recorte, com '+fmt(top.count)+' ocorrências ('+(100*top.count/latest.total).toFixed(1).replace('.',',')+'%).':'Sem líder no período.';
  const limit=Number(by('limit').value),maximum=top?.count||1;
  by('ranking').innerHTML=latest.ranking.slice(0,limit).map((r,i)=>'<div class="dm-row"><span class="dm-label">'+(i+1)+'. '+esc(r.service)+' <small>'+esc(r.kind)+'</small></span><div class="dm-track"><span style="width:'+Math.max(1,100*r.count/maximum)+'%"></span></div><b>'+fmt(r.count)+'</b></div>').join('');
  const W=920,H=180,M=22,max=Math.max(1,...latest.series.map(r=>r.count));
  const pts=latest.series.map((r,i)=>[(M+i*(W-2*M)/Math.max(1,latest.series.length-1)).toFixed(1),(H-M-r.count*(H-2*M)/max).toFixed(1)].join(',')).join(' ');
  by('trend').innerHTML='<svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Evolução diária de ocorrências de procura"><line x1="'+M+'" y1="'+(H-M)+'" x2="'+(W-M)+'" y2="'+(H-M)+'" stroke="#d6e4e9"/><polyline points="'+pts+'" fill="none" stroke="#087e88" stroke-width="3"/>'+latest.series.map((r,i)=>'<circle cx="'+(M+i*(W-2*M)/Math.max(1,latest.series.length-1))+'" cy="'+(H-M-r.count*(H-2*M)/max)+'" r="3" fill="#087e88"><title>'+esc(r.date)+': '+r.count+'</title></circle>').join('')+'</svg><div class="dm-axis"><span>'+esc(filters.from)+'</span><span>Pico diário: '+fmt(max===1&&latest.total===0?0:max)+'</span><span>'+esc(filters.to)+'</span></div>';
  by('table').innerHTML=latest.ranking.map(r=>'<tr><td>'+esc(r.service)+'</td><td>'+esc(r.kind)+'</td><td>'+fmt(r.count)+'</td><td>'+(100*r.count/(latest.total||1)).toFixed(1).replace('.',',')+'%</td></tr>').join('');
  const c=latest.coverage;
  by('coverage').textContent='Cobertura da fonte no período, antes de filtrar tipo ou nome: '+fmt(c.matched)+' de '+fmt(c.contact_days)+' contatos/dia com serviço reconhecido. '+fmt(c.unmatched)+' de '+fmt(c.observations)+' observações não corresponderam ao dicionário; podem ser saudações, assuntos administrativos ou serviços não reconhecidos.';
  by('daily').innerHTML=latest.series.map(r=>'<tr><td>'+esc(r.date)+'</td><td>'+fmt(r.count)+'</td></tr>').join('');
 }
 for(const id of ['from','to','source','kind','limit','level'])by(id).addEventListener('change',render);
 by('search').addEventListener('input',render);
 root.querySelectorAll('[data-days]').forEach(button=>button.addEventListener('click',()=>{
  const n=Number(button.getAttribute('data-days'));by('to').value=data.date_max;
  const d=new Date(data.date_max+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-n+1);by('from').value=n===0?data.date_min:d.toISOString().slice(0,10);render();
 }));
 by('csv').addEventListener('click',()=>{
  if(!latest||latest.error)return;
  const quote=s=>'"'+String(s).replace(/"/g,'""')+'"';
  const lines=[['servico','tipo','ocorrencias','data_inicio','data_fim','fonte','agrupamento'],...latest.ranking.map(r=>[r.service,r.kind,r.count,by('from').value,by('to').value,by('source').value,by('level').value])];
  const blob=new Blob(['\uFEFF'+lines.map(r=>r.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ana-demanda-'+by('from').value+'-a-'+by('to').value+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
 });
 render();
}
function dashboardHTML(data) {
 if(!data?.date_min)return '<section><h2>Procura por exames e consultas</h2><p>Ainda não há dados de procura disponíveis.</p></section>';
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const json=JSON.stringify(data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
 return '<section id="ana-demand"><style>#ana-demand .dm-filters{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}#ana-demand label{font-size:14px;font-weight:600}#ana-demand input,#ana-demand select{display:block;box-sizing:border-box;width:100%;padding:10px;border:1px solid #bacbd3;border-radius:7px;background:white;color:#142b3e;font:inherit;margin-top:4px}#ana-demand button{border:1px solid #bacbd3;background:#edf7f6;padding:8px 14px;border-radius:7px;color:#075863;cursor:pointer;font:inherit}#ana-demand .dm-actions{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0}#ana-demand .dm-metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}#ana-demand .dm-card{background:#edf7f6;border-radius:10px;padding:18px}#ana-demand strong{display:block;font-size:28px;color:#08717a}#ana-demand .dm-card span{font-size:14px}#ana-demand .dm-row{display:grid;grid-template-columns:minmax(130px,38%) 1fr 48px;gap:12px;align-items:center;margin:14px 0;font-size:14px}#ana-demand .dm-label small{display:block}#ana-demand .dm-track{background:#edf3f5;border-radius:5px;overflow:hidden}#ana-demand .dm-track span{display:block;height:18px;background:#0c8790}#ana-demand svg{width:100%;height:auto}#ana-demand .dm-axis{display:flex;justify-content:space-between;font-size:12px;color:#536779}#ana-demand .dm-scroll{overflow:auto}#ana-demand details{margin:18px 0}#ana-demand .dm-note{font-size:14px;color:#435d6a}#ana-demand [role=status]{min-height:1.6em}@media print{#ana-demand button{display:none}}</style><h2>Exames e consultas mais procurados</h2><p>Demanda identificada nas conversas — filtro pela <b>data da mensagem ou do registro</b>, em São Paulo. Não é a data de realização do exame ou da consulta.</p><div class="dm-filters"><label>Data inicial<input data-demand="from" type="date" value="'+esc(data.date_min)+'"></label><label>Data final<input data-demand="to" type="date" value="'+esc(data.date_max)+'"></label><label>Agrupamento<select data-demand="level"><option value="category">Categorias (Laboratorial agrupado)</option><option value="service">Exames e consultas detalhados</option></select></label><label>Tipo<select data-demand="kind"><option>Todos</option><option>Exame</option><option>Consulta</option></select></label><label>Fonte<select data-demand="source"><option value="mensagem_cliente">Mensagens dos clientes</option><option value="estrutura_ana">Registros estruturados da Ana</option></select></label><label>Buscar serviço<input data-demand="search" type="search" placeholder="Ex.: Laboratorial"></label><label>Exibir no ranking<select data-demand="limit"><option value="10">Top 10</option><option value="20">Top 20</option><option value="100">Todos</option></select></label></div><div class="dm-actions"><button type="button" data-days="7">Últimos 7 dias</button><button type="button" data-days="30">Últimos 30 dias</button><button type="button" data-days="0">Todo o histórico coletado</button><button type="button" data-demand="csv">Exportar tabela CSV</button></div><p role="status" aria-live="polite" data-demand="status"></p><div class="dm-metrics" data-demand="metrics"></div><h3>Ranking do período</h3><p data-demand="leader"></p><div data-demand="ranking"></div><h3>Evolução diária</h3><div data-demand="trend"></div><details><summary>Tabela completa por serviço</summary><div class="dm-scroll"><table><thead><tr><th>Serviço</th><th>Tipo</th><th>Ocorrências</th><th>Participação</th></tr></thead><tbody data-demand="table"></tbody></table></div></details><details><summary>Tabela diária acessível</summary><table><thead><tr><th>Data</th><th>Ocorrências</th></tr></thead><tbody data-demand="daily"></tbody></table></details><p class="dm-note" data-demand="coverage"></p><p class="dm-note">Uma ocorrência = um contato, em um dia, mencionando uma categoria ou serviço, conforme o agrupamento selecionado. Hemograma, TGO, TGP e os demais exames de sangue integram Laboratorial, junto de urina e fezes. Na visão por categorias, vários exames laboratoriais do mesmo contato/dia contam uma única vez. Na visão detalhada, cada exame conta separadamente; por isso os totais das duas visões não são equivalentes. Repetições no mesmo dia são deduplicadas; o mesmo contato em dias diferentes volta a contar. Um contato pode procurar vários serviços, portanto o total não representa clientes únicos. As duas fontes são alternativas e não devem ser somadas.</p><p class="dm-note">Detecção por dicionário de '+data.dictionary_size+' serviços e sinônimos, sem classificação clínica. Menções podem ser dúvidas, resultados, negativas ou serviços que a clínica não oferece. A fonte estruturada depende do que a Ana extraiu; a fonte direta depende dos termos reconhecidos. O ranking não comprova intenção de compra, agendamento ou oferta disponível.</p><p class="dm-note">Dados coletados em '+esc(data.as_of)+'. O arquivo HTML é um retrato: os filtros funcionam offline; para dados novos, gere o HTML novamente no n8n. Relatório privado, sem nomes, telefones ou transcrições.</p><noscript>Ative JavaScript para utilizar os filtros deste dashboard.</noscript></section><script>const aggregateDemand='+aggregateDemand.toString()+';('+demandClient.toString()+')('+json+');</script>';
}
if(typeof module!=='undefined')module.exports={aggregateDemand,dashboardHTML};

