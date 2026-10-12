BEGIN;
SET LOCAL lock_timeout='5s';
CREATE SCHEMA IF NOT EXISTS ana_ml;
REVOKE ALL ON SCHEMA ana_ml FROM PUBLIC;
CREATE TABLE IF NOT EXISTS ana_ml.models (
  model_id text PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now(),
  algorithm_version text NOT NULL, artifact jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS ana_ml.runs (
  run_id text PRIMARY KEY, collected_at timestamptz NOT NULL, saved_at timestamptz NOT NULL DEFAULT now(),
  model_id text REFERENCES ana_ml.models(model_id), summary jsonb NOT NULL, report_html text NOT NULL
);
CREATE TABLE IF NOT EXISTS ana_ml.sessions (
  session_id text PRIMARY KEY, first_message_id bigint NOT NULL, day date NOT NULL,
  source_updated_at timestamptz NOT NULL, analyzed_at timestamptz NOT NULL,
  model_id text REFERENCES ana_ml.models(model_id), features jsonb NOT NULL,
  analise_ml jsonb NOT NULL, priority numeric NOT NULL CHECK(priority BETWEEN 0 AND 100),
  cluster integer, anomaly boolean NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS ana_ml_sessions_day_priority ON ana_ml.sessions(day, priority DESC);
CREATE TABLE IF NOT EXISTS ana_ml.labels (
  session_id text PRIMARY KEY REFERENCES ana_ml.sessions(session_id), reviewed_at timestamptz NOT NULL DEFAULT now(),
  outcome text NOT NULL CHECK(outcome IN ('falha_confirmada','sem_falha','inconclusivo')),
  category text NOT NULL CHECK(category IN ('clareza','preco','agenda','preparo','resultado','encaminhamento','outro')),
  reviewer text NOT NULL, note text CHECK(length(note)<=500)
);
ALTER TABLE ana_ml.models ENABLE ROW LEVEL SECURITY;
ALTER TABLE ana_ml.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ana_ml.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ana_ml.labels ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA ana_ml FROM PUBLIC;
DO $$ DECLARE r text; BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
      EXECUTE format('REVOKE ALL ON SCHEMA ana_ml FROM %I',r);
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA ana_ml FROM %I',r);
    END IF;
  END LOOP;
END $$;
COMMENT ON SCHEMA ana_ml IS 'Ana ML v1: auditoria operacional; sem decisões clínicas, envio ou alteração de leads.';

SELECT jsonb_build_object('instalado',true,'schema','ana_ml','role',current_user,'tabelas',(SELECT count(*) FROM information_schema.tables WHERE table_schema='ana_ml')) AS resultado;

CREATE OR REPLACE FUNCTION ana_ml.collect_demand(p_days integer DEFAULT 90)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public,ana_ml AS $fn$
WITH bounds AS (
 SELECT now() as collected_at,(now() AT TIME ZONE 'America/Sao_Paulo')::date AS today,greatest(1,least(coalesce(p_days,90),90)) AS days
), dictionary_raw(kind,service,rx,exclude_rx) AS (VALUES
 ('Exame','Hemograma','\mhemograma\M',NULL),
 ('Exame','Toxicológico','toxicolog',NULL),
 ('Exame','Ultrassonografia transvaginal','transvaginal',NULL),
 ('Exame','Ultrassonografia obstétrica','obstetric',NULL),
 ('Exame','Ultrassonografia morfológica','morfologic',NULL),
 ('Exame','Ultrassonografia abdominal','((ultra|ecograf).*(abdom)|(abdom).*(ultra|ecograf))',NULL),
 ('Exame','Ultrassonografia pélvica','((ultra|ecograf).*pelvic|pelvic.*(ultra|ecograf))',NULL),
 ('Exame','Ultrassonografia mamária','((ultra|ecograf).*(mama|mamaria)|(mama|mamaria).*(ultra|ecograf))',NULL),
 ('Exame','Ultrassonografia de tireoide','((ultra|ecograf).*tireo|tireo.*(ultra|ecograf))',NULL),
 ('Exame','Ultrassonografia — tipo não especificado','(ultrasso|ultra[ -]?som|ecograf)','(transvaginal|obstetric|morfologic|abdom|pelvic|mama|tireo|doppler)'),
 ('Exame','Doppler','doppler',NULL),
 ('Exame','Exames laboratoriais — genérico','(exames? (de sangue|laboratoria[l]|laboratoriais)|analises clinicas)',NULL),
 ('Exame','TSH','\mtsh\M',NULL),
 ('Exame','T4 livre','\mt4\M',NULL),
 ('Exame','TGO / AST','\m(tgo|ast)\M',NULL),
 ('Exame','TGP / ALT','\m(tgp|alt)\M',NULL),
 ('Exame','Vitamina B12','(vitamina[ ]*b[ ]*12|\mb12\M)',NULL),
 ('Exame','Vitamina D','(vitamina[ ]*d\M|25.{0,15}hidroxi)',NULL),
 ('Exame','Vitamina C','vitamina[ ]*c\M',NULL),
 ('Exame','Creatinina','creatinina',NULL),
 ('Exame','Ureia','ureia',NULL),
 ('Exame','Ferritina','ferritina',NULL),
 ('Exame','Glicose / glicemia','(glicose|glicemia)',NULL),
 ('Exame','Hemoglobina glicada','(hemoglobina glicada|hba1c)',NULL),
 ('Exame','Colesterol','colesterol',NULL),
 ('Exame','Triglicerídeos','(triglicerid|triglicer[ií]d|trigliceri)',NULL),
 ('Exame','Gama GT','(gama[ -]?gt|\mggt\M)',NULL),
 ('Exame','Potássio','potassio',NULL),
 ('Exame','Sódio','sodio',NULL),
 ('Exame','Magnésio','magnesio',NULL),
 ('Exame','Homocisteína','homocisteina',NULL),
 ('Exame','VHS','\mvhs\M',NULL),
 ('Exame','FSH','\mfsh\M',NULL),
 ('Exame','LH','\mlh\M',NULL),
 ('Exame','Estradiol','estradiol',NULL),
 ('Exame','Insulina','\minsulina\M',NULL),
 ('Exame','Sexagem fetal','sexagem',NULL),
 ('Exame','Holter','holter',NULL),
 ('Exame','MAPA','(\mmapa\M.{0,12}(24|pressao)|exame.{0,12}\mmapa\M|^mapa$)',NULL),
 ('Exame','Eletrocardiograma','(eletrocardio|\mecg\M)',NULL),
 ('Exame','Ecocardiograma','(ecocardio)',NULL),
 ('Exame','Tomografia','tomograf',NULL),
 ('Exame','Ressonância magnética','ressonancia',NULL),
 ('Exame','Mamografia','mamograf',NULL),
 ('Exame','Densitometria','densitometr',NULL),
 ('Exame','Colonoscopia','colonoscop',NULL),
 ('Exame','Endoscopia','endoscop',NULL),
 ('Exame','Eletroneuromiografia','(eletroneuromiograf|\menmg\M)',NULL),
 ('Exame','Raio X','(raio[ -]?x|radiograf)',NULL),
 ('Exame','Eletroencefalograma','(eletroencefalo|\meeg\M)',NULL),
 ('Exame','Espirometria','espirometr',NULL),
 ('Exame','Audiometria','audiometr',NULL),
 ('Exame','Beta HCG','(beta[ -]?hcg|\mbhcg\M)',NULL),
 ('Exame','Urina / urocultura','(urina|urocultura)',NULL),
 ('Exame','Parasitológico / fezes','(parasitolog|exame de fezes)',NULL),
 ('Consulta','Cardiologia','(cardiologista|consulta.{0,35}cardiolog)',NULL),
 ('Consulta','Ginecologia','(ginecologista|consulta.{0,35}ginecolog)',NULL),
 ('Consulta','Pediatria','(pediatra|consulta.{0,35}pediatri)',NULL),
 ('Consulta','Dermatologia','(dermatologista|consulta.{0,35}dermatolog)',NULL),
 ('Consulta','Endocrinologia','(endocrinologista|consulta.{0,35}endocrinolog)',NULL),
 ('Consulta','Neurologia','(neurologista|consulta.{0,35}neurolog)',NULL),
 ('Consulta','Ortopedia','(ortopedista|consulta.{0,35}ortopedi)',NULL),
 ('Consulta','Clínica geral','(clinico geral|consulta.{0,20}clinic)',NULL),
 ('Consulta','Urologia','(urologista|consulta.{0,35}urolog)',NULL),
 ('Consulta','Consulta — especialidade não identificada','\mconsultas?\M','(cardiolog|ginecolog|pediatr|dermatolog|endocrinolog|neurolog|ortopedi|clinic|urolog|consulta.{0,12}(resultado|exame|laudo))')
), dictionary AS (
 SELECT d.*,CASE WHEN service IN ('Hemograma','Exames laboratoriais — genérico','TSH','T4 livre','TGO / AST','TGP / ALT','Vitamina B12','Vitamina D','Vitamina C','Creatinina','Ureia','Ferritina','Glicose / glicemia','Hemoglobina glicada','Colesterol','Triglicerídeos','Gama GT','Potássio','Sódio','Magnésio','Homocisteína','VHS','FSH','LH','Estradiol','Insulina','Sexagem fetal','Beta HCG','Urina / urocultura','Parasitológico / fezes') THEN 'Laboratorial' ELSE service END category
 FROM dictionary_raw d
), raw AS MATERIALIZED (
 SELECT m.phone,m.role,m.dados,(m.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
 translate(lower(coalesce(m.conteudo,'')),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc') txt
 FROM public.ana_mensagens m CROSS JOIN bounds b
 WHERE m.created_at>=((b.today-b.days)::timestamp AT TIME ZONE 'America/Sao_Paulo')
 AND m.created_at<=b.collected_at AND m.phone IS NOT NULL
), observations AS MATERIALIZED (
 SELECT phone,day,'mensagem_cliente'::text source,txt FROM raw WHERE role='user'
 UNION ALL
 SELECT r.phone,r.day,'estrutura_ana',translate(lower(x #>> '{}'),'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc')
 FROM raw r CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(dados->'exames_mencionados')='array' THEN dados->'exames_mencionados' ELSE '[]'::jsonb END) x
 WHERE jsonb_typeof(x)='string'
), classified AS MATERIALIZED (
 SELECT o.txt,d.kind,d.service,d.category
 FROM (SELECT DISTINCT txt FROM observations) o JOIN dictionary d ON o.txt~d.rx AND (d.exclude_rx IS NULL OR o.txt!~d.exclude_rx)
), detected AS MATERIALIZED (
 SELECT DISTINCT o.phone,o.day,o.source,d.kind,d.service,d.category
 FROM observations o JOIN classified d ON d.txt=o.txt
), daily AS (
 SELECT day,source,kind,service,category,'service'::text level,count(*) n FROM detected GROUP BY day,source,kind,service,category
 UNION ALL
 SELECT day,source,kind,category,category,'category',count(DISTINCT phone) FROM detected GROUP BY day,source,kind,category
), matched AS (
 SELECT DISTINCT phone,day,source FROM detected
), coverage AS (
 SELECT o.day,o.source,count(DISTINCT o.phone) contact_days,
 count(DISTINCT o.phone) FILTER(WHERE m.phone IS NOT NULL) matched_contact_days,
 count(*) observations,
 count(*) FILTER(WHERE recognized.txt IS NULL) unmatched_observations
 FROM observations o LEFT JOIN matched m ON m.phone=o.phone AND m.day=o.day AND m.source=o.source
 LEFT JOIN (SELECT DISTINCT txt FROM classified) recognized ON recognized.txt=o.txt GROUP BY o.day,o.source
)
SELECT jsonb_build_object('version','ana-demand-1.0.0','as_of',b.collected_at,'date_min',(SELECT min(day) FROM raw),'date_max',b.today,
 'window_days',b.days,'dictionary_size',(SELECT count(*) FROM dictionary),
 'rows',coalesce((SELECT jsonb_agg(jsonb_build_object('date',day,'source',source,'kind',kind,'service',service,'category',category,'level',level,'count',n) ORDER BY day,source,level,kind,service) FROM daily),'[]'::jsonb),
 'coverage',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY day,source) FROM coverage c),'[]'::jsonb))
FROM bounds b;
$fn$;
REVOKE ALL ON FUNCTION ana_ml.collect_demand(integer) FROM PUBLIC;
SELECT jsonb_build_object('dashboard_demanda_instalado',true) AS resultado;


CREATE OR REPLACE FUNCTION ana_ml.collect_features(p_days integer DEFAULT 90)
RETURNS jsonb LANGUAGE sql STABLE SET search_path=pg_catalog,public,ana_ml AS $fn$
WITH bounds AS (
 SELECT now() AS collected_at, (now() AT TIME ZONE 'America/Sao_Paulo')::date AS today,
 greatest(1,least(coalesce(p_days,90),90)) AS days
), raw AS MATERIALIZED (
 SELECT m.id,m.phone,m.role,m.tipo,m.created_at,
 (m.created_at AT TIME ZONE 'America/Sao_Paulo')::date AS day,
 translate(lower(coalesce(m.conteudo,'')), 'áàâãäéèêëíìîïóòôõöúùûüç','aaaaaeeeeiiiiooooouuuuc') AS txt
 FROM public.ana_mensagens m CROSS JOIN bounds b
 WHERE m.created_at >= ((b.today-b.days)::timestamp AT TIME ZONE 'America/Sao_Paulo')
 AND m.created_at <= b.collected_at AND m.phone IS NOT NULL
), events AS (
 SELECT *, lead(role) OVER w AS next_role, lead(created_at) OVER w AS next_at,
 lag(txt) OVER w AS previous_txt, lag(role) OVER w AS previous_role,
 row_number() OVER(PARTITION BY phone,day ORDER BY created_at DESC,id DESC) AS reverse_position,
 row_number() OVER(PARTITION BY phone,day,role ORDER BY created_at DESC,id DESC) AS role_reverse_position
 FROM raw WINDOW w AS(PARTITION BY phone ORDER BY created_at,id)
), grouped AS (
 SELECT phone,day,min(id) AS first_message_id,max(created_at) AS source_updated_at,
 count(*) AS messages, count(*) FILTER(WHERE role='user') AS user_count,
 count(*) FILTER(WHERE role='assistant' AND tipo IS DISTINCT FROM 'humano') AS bot_count,
 count(*) FILTER(WHERE tipo='humano') AS human_count,
 count(*) FILTER(WHERE role='user' AND previous_role='user' AND length(txt)>10 AND txt=previous_txt) AS repeated_user,
 count(*) FILTER(WHERE role='user' AND txt ~ '(nao entendi|nao respondeu|nao responde|demora|demorando|isso esta errado|pessimo|insatisfeit|ninguem responde|de novo|ja falei)') AS friction_count,
 count(*) FILTER(WHERE role='user' AND txt ~ '(atendente humano|falar com (alguem|uma pessoa|um atendente)|atendimento humano|quero um humano)') AS human_request,
 count(*) FILTER(WHERE role='assistant' AND tipo IS DISTINCT FROM 'humano' AND txt ~ '(nao (tenho|encontrei|consigo)|preciso (confirmar|verificar)|vou (confirmar|verificar)|nao esta disponivel)') AS knowledge_gap,
 coalesce(percentile_cont(0.5) WITHIN GROUP(ORDER BY least(1440,extract(epoch FROM(next_at-created_at))/60)) FILTER(WHERE role='user' AND next_role='assistant'),0) AS median_reply_minutes,
 count(*) FILTER(WHERE role='user' AND next_role='assistant') AS reply_pairs,
 bool_or(reverse_position=1 AND role='user' AND next_at IS NULL AND txt !~ '^[[:space:][:punct:]]*(obrigad[oa]|ok|certo|valeu|bom dia|boa tarde|boa noite|tchau)[[:space:][:punct:]]*$') AS last_user_actionable,
 bool_or(role_reverse_position=1 AND role='user' AND txt ~ '(nao entendi|pessimo|insatisfeit|demora|errado|nao responde|ninguem responde)') AS last_negative,
 bool_or(role_reverse_position=1 AND role='user' AND txt ~ '(obrigad|excelente|otimo|perfeito|adorei)') AS last_positive,
 count(*) FILTER(WHERE role='user' AND txt ~ '(preco|valor|quanto custa|orcamento)') AS topic_price,
 count(*) FILTER(WHERE role='user' AND txt ~ '(agendar|marcar|horario|vaga)') AS topic_schedule,
 count(*) FILTER(WHERE role='user' AND txt ~ '(preparo|jejum|medicamento|remedio)') AS topic_preparation,
 count(*) FILTER(WHERE role='user' AND txt ~ '(resultado|laudo|acessar exame)') AS topic_result,
 count(*) FILTER(WHERE role='user' AND txt ~ '(pare de|nao (me )?(mande|envie)|remova meu|retire meu|nao quero (mais )?(mensagens|contato))') AS explicit_optout
 FROM events GROUP BY phone,day
), eligible AS MATERIALIZED (
 SELECT * FROM grouped WHERE user_count>0
), selected AS (
 SELECT * FROM eligible ORDER BY day DESC,first_message_id DESC LIMIT 10000
), features AS (
 SELECT jsonb_build_object(
 'session_id','s'||g.first_message_id,'first_message_id',g.first_message_id::text,'day',g.day,
 'source_updated_at',g.source_updated_at,'messages',g.messages,'user_count',g.user_count,'bot_count',g.bot_count,
 'human_count',g.human_count,'repeated_user',g.repeated_user,'friction_count',g.friction_count,
 'human_request',g.human_request,'knowledge_gap',g.knowledge_gap,'median_reply_minutes',g.median_reply_minutes,
 'reply_pairs',g.reply_pairs,'unanswered',g.last_user_actionable AND g.source_updated_at < b.collected_at-interval '30 minutes',
 'last_negative',g.last_negative,'last_positive',g.last_positive,
 'topic_price',g.topic_price,'topic_schedule',g.topic_schedule,'topic_preparation',g.topic_preparation,'topic_result',g.topic_result,
 'explicit_optout',g.explicit_optout,'opt_out',coalesce(l.opt_out,false),'escalado',coalesce(l.escalado,false),
 'bot_ativo',coalesce(l.bot_ativo,false),'booking_confirmed',coalesce(l.agendamento->>'status'='confirmado',false),
 'lead_present',l.phone IS NOT NULL
 ) AS f FROM selected g CROSS JOIN bounds b LEFT JOIN public.ana_leads l ON l.phone=g.phone
)
SELECT jsonb_build_object('collected_at',b.collected_at,'today',b.today,'window_days',b.days,
 'eligible_sessions',(SELECT count(*) FROM eligible),'selected_sessions',(SELECT count(*) FROM selected),
 'source_messages',(SELECT count(*) FROM raw),'excluded_no_user',(SELECT count(*) FROM grouped WHERE user_count=0),
 'sessions',coalesce((SELECT jsonb_agg(f ORDER BY f->>'day',f->>'session_id') FROM features),'[]'::jsonb),
 'demand',ana_ml.collect_demand(b.days),
 'model',(SELECT artifact FROM ana_ml.models WHERE algorithm_version='ana-ml-1.0.0' ORDER BY created_at DESC LIMIT 1))
FROM bounds b;
$fn$;
REVOKE ALL ON FUNCTION ana_ml.collect_features(integer) FROM PUBLIC;
SELECT jsonb_build_object('funcao','ana_ml.collect_features','instalada',true) AS resultado;

CREATE OR REPLACE FUNCTION ana_ml.save_run(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public,ana_ml AS $fn$
DECLARE collected timestamptz; previous timestamptz; mid text; sid text; n integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('ana_ml.save_run.v1'));
 IF p->'summary'->>'version' IS DISTINCT FROM 'ana-ml-1.0.0' OR p->'summary'->'shadow_mode' IS DISTINCT FROM 'true'::jsonb
 OR jsonb_typeof(p->'sessions') IS DISTINCT FROM 'array' OR length(p::text)>20000000
 OR jsonb_array_length(p->'sessions')>10000 THEN RAISE EXCEPTION 'Contrato ML inválido'; END IF;
 collected:=(p->>'collected_at')::timestamptz;
 IF collected IS NULL OR collected>now()+interval '5 minutes' THEN RAISE EXCEPTION 'Coleta inválida'; END IF;
 SELECT max(collected_at) INTO previous FROM ana_ml.runs;
 IF previous IS NOT NULL AND previous>=collected THEN RETURN jsonb_build_object('status','ignorado_obsoleto_ou_duplicado','ultima_coleta',previous); END IF;
 IF p->'model' IS NOT NULL AND p->'model'<>'null'::jsonb THEN
   mid:=p->'model'->>'id';
   IF p->'model'->>'version' IS DISTINCT FROM 'ana-ml-1.0.0' OR mid IS NULL THEN RAISE EXCEPTION 'Modelo inválido'; END IF;
   INSERT INTO ana_ml.models(model_id,algorithm_version,artifact) VALUES(mid,'ana-ml-1.0.0',p->'model') ON CONFLICT DO NOTHING;
   IF NOT EXISTS(SELECT 1 FROM ana_ml.models WHERE model_id=mid AND artifact=p->'model') THEN RAISE EXCEPTION 'Colisão de versão do modelo'; END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p->'sessions') x
 WHERE x->'analise_ml'->'envio_automatico' IS DISTINCT FROM 'false'::jsonb OR x->'analise_ml'->'alterar_prompt_automaticamente' IS DISTINCT FROM 'false'::jsonb
 OR x->>'session_id' !~ '^s[0-9]+$' OR (x->>'priority')::numeric NOT BETWEEN 0 AND 100)
 THEN RAISE EXCEPTION 'Contrato de unidade inválido'; END IF;
 INSERT INTO ana_ml.runs(run_id,collected_at,model_id,summary,report_html)
 VALUES(p->>'run_id',collected,mid,p->'summary',p->>'report_html');
 INSERT INTO ana_ml.sessions(session_id,first_message_id,day,source_updated_at,analyzed_at,model_id,features,analise_ml,priority,cluster,anomaly)
 SELECT x->>'session_id',(x->>'first_message_id')::bigint,(x->>'day')::date,(x->>'source_updated_at')::timestamptz,
 collected,mid,x->'features',x->'analise_ml',(x->>'priority')::numeric,(x->>'cluster')::integer,(x->>'anomaly')::boolean
 FROM jsonb_array_elements(p->'sessions') x
 ON CONFLICT(session_id) DO UPDATE SET source_updated_at=excluded.source_updated_at,analyzed_at=excluded.analyzed_at,
 model_id=excluded.model_id,features=excluded.features,analise_ml=excluded.analise_ml,priority=excluded.priority,
 cluster=excluded.cluster,anomaly=excluded.anomaly WHERE ana_ml.sessions.analyzed_at<excluded.analyzed_at;
 GET DIAGNOSTICS n=ROW_COUNT;
 RETURN jsonb_build_object('status','salvo','run_id',p->>'run_id','unidades',n,'summary',p->'summary','report_html',p->>'report_html');
END;
$fn$;
REVOKE ALL ON FUNCTION ana_ml.save_run(jsonb) FROM PUBLIC;
SELECT jsonb_build_object('funcao','ana_ml.save_run','instalada',true) AS resultado;

-- Preserve the existing ANA04 contract and destination. Only choose the sample.
CREATE OR REPLACE FUNCTION ana_ml.audit_payload(p_day date DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=pg_catalog,public,ana_ml AS $fn$
DECLARE base jsonb; ref date; result jsonb;
BEGIN
 base:=public.ana_auditoria_conversas(p_day)::jsonb;
 IF jsonb_array_length(coalesce(base->'conversas','[]'::jsonb))=0 THEN RETURN base; END IF;
 ref:=to_date(base->>'data_referencia','DD/MM/YYYY');
 IF NOT EXISTS(SELECT 1 FROM ana_ml.sessions WHERE day=ref AND analyzed_at>now()-interval '26 hours') THEN
  RETURN base || jsonb_build_object('amostragem_ml',jsonb_build_object('modo','fallback_original','motivo','ML ausente ou desatualizado'));
 END IF;
 WITH candidates AS MATERIALIZED (
  SELECT c AS conversation,c->>'phone' AS phone,s.session_id,coalesce(s.priority,0) AS priority,
   s.analise_ml,s.anomaly
  FROM jsonb_array_elements(base->'conversas') c
  LEFT JOIN LATERAL (
   SELECT a.* FROM ana_ml.sessions a JOIN public.ana_mensagens m ON m.id=a.first_message_id
   WHERE a.day=ref AND m.phone=c->>'phone' AND a.analyzed_at>now()-interval '26 hours'
   ORDER BY a.analyzed_at DESC LIMIT 1
  ) s ON true
 ), risk AS (
  SELECT *,0 AS bucket FROM candidates WHERE priority>0
  ORDER BY priority DESC,md5(phone||ref::text) LIMIT 30
 ), comparison AS (
  SELECT *,1 AS bucket FROM candidates c WHERE NOT EXISTS(SELECT 1 FROM risk r WHERE r.phone=c.phone)
  ORDER BY md5(phone||ref::text) LIMIT (40-(SELECT count(*) FROM risk))
 ), chosen AS (SELECT * FROM risk UNION ALL SELECT * FROM comparison)
 SELECT jsonb_build_object('conversas',coalesce(jsonb_agg(conversation || jsonb_build_object('ml',
  jsonb_build_object('session_id',session_id,'prioridade',priority,'anomalia',anomaly,
    'tags',analise_ml->'tags','grupo_amostra',CASE WHEN bucket=0 THEN 'priorizada' ELSE 'comparacao' END))
  ORDER BY bucket,priority DESC,md5(phone||ref::text)),'[]'::jsonb),
  'amostragem_ml',jsonb_build_object('modo','priorizada_com_comparacao','elegiveis',jsonb_array_length(base->'conversas'),
   'selecionadas',count(*),'priorizadas',count(*) FILTER(WHERE bucket=0),'comparacao',count(*) FILTER(WHERE bucket=1),
   'limite',40,'aviso','Amostra dirigida; não representa taxa de falhas da base. ML e heurísticas são pistas, não provas.'))
 INTO result FROM chosen;
 RETURN base || result;
END;
$fn$;
REVOKE ALL ON FUNCTION ana_ml.audit_payload(date) FROM PUBLIC;

-- Authenticated operators use the existing privileged database connection.
-- No public API, no production lead changes, no automatic knowledge promotion.
CREATE OR REPLACE FUNCTION ana_ml.record_review(p_session text,p_outcome text,p_category text,p_reviewer text,p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SET search_path=pg_catalog,public,ana_ml AS $fn$
BEGIN
 IF p_reviewer IS NULL OR length(trim(p_reviewer))<2 THEN RAISE EXCEPTION 'Revisor obrigatório'; END IF;
 INSERT INTO ana_ml.labels(session_id,outcome,category,reviewer,note)
 VALUES(p_session,p_outcome,p_category,trim(p_reviewer),p_note)
 ON CONFLICT(session_id) DO UPDATE SET outcome=excluded.outcome,category=excluded.category,
 reviewer=excluded.reviewer,note=excluded.note,reviewed_at=now();
 RETURN jsonb_build_object('status','revisao_registrada','session_id',p_session);
END;
$fn$;
REVOKE ALL ON FUNCTION ana_ml.record_review(text,text,text,text,text) FROM PUBLIC;
SELECT jsonb_build_object('auditoria_priorizada_instalada',true,'feedback_humano_instalado',true) AS resultado;

COMMIT;
