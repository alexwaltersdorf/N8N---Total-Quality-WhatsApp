SELECT jsonb_build_object(
 'tabelas',(SELECT count(*) FROM information_schema.tables WHERE table_schema='ana_ml'),
 'rls_ativas',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='ana_ml' AND c.relkind='r' AND c.relrowsecurity),
 'acesso_anon',has_schema_privilege('anon','ana_ml','USAGE'),
 'acesso_authenticated',has_schema_privilege('authenticated','ana_ml','USAGE'),
 'execucoes',(SELECT count(*) FROM ana_ml.runs),
 'modelos',(SELECT count(*) FROM ana_ml.models),
 'sessoes',(SELECT count(*) FROM ana_ml.sessions),
 'violacoes_envio',(SELECT count(*) FROM ana_ml.sessions WHERE analise_ml->'envio_automatico' IS DISTINCT FROM 'false'::jsonb OR analise_ml->'alterar_prompt_automaticamente' IS DISTINCT FROM 'false'::jsonb),
 'ultima_coleta',(SELECT max(collected_at) FROM ana_ml.runs),
 'ultima_summary',(SELECT summary FROM ana_ml.runs ORDER BY collected_at DESC LIMIT 1),
 'rotulos_humanos',(SELECT count(*) FROM ana_ml.labels),
 'html_valido',(SELECT report_html LIKE '<!doctype html>%' FROM ana_ml.runs ORDER BY collected_at DESC LIMIT 1),
 'dashboard_presente',(SELECT position('id="ana-demand"' in report_html)>0 FROM ana_ml.runs ORDER BY collected_at DESC LIMIT 1),
 'laboratorial_presente',(SELECT position('Laboratorial' in report_html)>0 FROM ana_ml.runs ORDER BY collected_at DESC LIMIT 1)
) AS resultado;

SELECT jsonb_build_object(
 'collected_at',r.collected_at,'report_html',r.report_html,
 'queue',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM (
 SELECT s.session_id,s.day,s.priority,s.analise_ml->>'score_qualidade' AS score,
 s.analise_ml->'tags' AS tags,s.analise_ml->>'proximo_passo_sugerido' AS next_step,
 s.analise_ml->>'sugestao_followup' AS followup,l.outcome AS review
 FROM ana_ml.sessions s LEFT JOIN ana_ml.labels l USING(session_id)
 WHERE s.day >= (now() AT TIME ZONE 'America/Sao_Paulo')::date-7
 ORDER BY s.priority DESC,s.day DESC,s.session_id LIMIT 50
 ) q),'[]'::jsonb)
) AS payload FROM ana_ml.runs r ORDER BY r.collected_at DESC LIMIT 1;

-- Modelos para operador autorizado; não executar exemplos sem preencher parâmetros.
-- Recuperar origem da referência interna no ambiente privado:
-- SELECT m.phone FROM ana_ml.sessions s JOIN public.ana_mensagens m ON m.id=s.first_message_id WHERE s.session_id=$1;
-- Registrar revisão humana, sem dados clínicos na nota:
-- SELECT ana_ml.record_review($1,$2,$3,$4,$5);
-- outcome: falha_confirmada | sem_falha | inconclusivo
-- category: clareza | preco | agenda | preparo | resultado | encaminhamento | outro
-- Conferir idade de ultima_coleta: atraso acima de 45 minutos exige investigação.
