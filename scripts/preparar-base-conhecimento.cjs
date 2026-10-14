const fs=require('fs'),path=require('path'),crypto=require('crypto');
const md5=s=>crypto.createHash('md5').update(s,'utf8').digest('hex');
function prepareKnowledgeUpdate(current,policy){
 if(typeof current!=='string'||!current.trim())throw new Error('Prompt atual obrigatório para preservar o conteúdo e criar backup.');
 if(!policy.includes('<!-- ANA_CONTINUIDADE_V2_INICIO -->')||!policy.includes('<!-- ANA_CONTINUIDADE_V2_FIM -->'))throw new Error('Módulo sem delimitadores.');
 const before=md5(current),backup='system_prompt_backup_continuidade_v2_'+before;
 const next=current.replace(/<!-- ANA_CONTINUIDADE_V2_INICIO -->[\s\S]*?<!-- ANA_CONTINUIDADE_V2_FIM -->/g,'').trim()+'\n\n'+policy.trim()+'\n';
 const after=md5(next),encoded=Buffer.from(next,'utf8').toString('base64');
 const sql="BEGIN;\nSET LOCAL lock_timeout='5s';\n"+
 "DO $guard$ BEGIN IF (SELECT md5(valor) FROM public.ana_config WHERE chave='system_prompt') IS DISTINCT FROM '"+before+"' THEN RAISE EXCEPTION 'Prompt atual mudou; revisar antes de atualizar'; END IF; END $guard$;\n"+
 "INSERT INTO public.ana_config(chave,valor) SELECT '"+backup+"',valor FROM public.ana_config WHERE chave='system_prompt' ON CONFLICT(chave) DO NOTHING;\n"+
 "DO $backup$ BEGIN IF (SELECT md5(valor) FROM public.ana_config WHERE chave='"+backup+"') IS DISTINCT FROM '"+before+"' THEN RAISE EXCEPTION 'Backup divergente'; END IF; END $backup$;\n"+
 "UPDATE public.ana_config SET valor=convert_from(decode('"+encoded+"','base64'),'UTF8'),updated_at=now() WHERE chave='system_prompt';\n"+
 "COMMIT;\nSELECT md5(valor) AS prompt_md5,length(valor) AS prompt_characters FROM public.ana_config WHERE chave='system_prompt';\n";
 return {sql,prompt:next,before_md5:before,after_md5:after,backup_key:backup};
}
module.exports={prepareKnowledgeUpdate};
if(require.main===module){
 const [input,output]=process.argv.slice(2);
 if(!input||!output)throw new Error('Uso: node scripts/preparar-base-conhecimento.cjs prompt-atual.txt private/atualizar-base.sql');
 const root=path.resolve(__dirname,'..'),dest=path.resolve(output),relative=path.relative(root,dest);
 if(!relative.startsWith('..')&&!path.isAbsolute(relative)&&!relative.startsWith('private'+path.sep))throw new Error('Dentro do repositório, salvar apenas em private/.');
 const current=fs.readFileSync(input,'utf8').replace(/^\uFEFF/,''),policy=fs.readFileSync(path.join(root,'conhecimento/continuidade-pausa-v2.md'),'utf8').replace(/^\uFEFF/,'');
 const result=prepareKnowledgeUpdate(current,policy);
 fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,result.sql);
 console.log(JSON.stringify({before_md5:result.before_md5,expected_after_md5:result.after_md5,backup_key:result.backup_key,deployed:false}));
}
