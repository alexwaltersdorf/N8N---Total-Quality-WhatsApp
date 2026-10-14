-- ANA v2: executar APENAS após conferir o esquema e fazer backup.
-- Adição reversível. Não apaga conversas, não reativa leads e não dispara mensagens.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $legacy$ DECLARE r text; BEGIN
 IF to_regclass('public.tq_boasvindas_enviadas') IS NULL THEN
  CREATE TABLE public.tq_boasvindas_enviadas (telefone text PRIMARY KEY,nome text,origem text,enviado_em timestamptz NOT NULL DEFAULT now());
  ALTER TABLE public.tq_boasvindas_enviadas ENABLE ROW LEVEL SECURITY;
  REVOKE ALL ON public.tq_boasvindas_enviadas FROM PUBLIC;
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
    EXECUTE format('REVOKE ALL ON public.tq_boasvindas_enviadas FROM %I',r);
   END IF;
  END LOOP;
 END IF;
END $legacy$;
CREATE TABLE IF NOT EXISTS ana_runtime_outbox (
 send_key text PRIMARY KEY, phone text NOT NULL, origin text NOT NULL,
 owner text NOT NULL, status text NOT NULL CHECK(status IN ('reserved','accepted','failed','unknown')),
 message_text text NOT NULL, message_norm text NOT NULL,
 provider_id text, created_at timestamptz NOT NULL DEFAULT now(),
 finished_at timestamptz, http_status integer,
 patient_snapshot timestamptz, input_id text, payload jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS ana_runtime_outbox_phone ON ana_runtime_outbox(phone,created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ana_runtime_outbox_provider
 ON ana_runtime_outbox(phone,provider_id) WHERE provider_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS ana_runtime_observed (
 phone text NOT NULL, message_id text NOT NULL, content text NOT NULL DEFAULT '',
 source text, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','bot','human')),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(phone,message_id)
);
CREATE INDEX IF NOT EXISTS ana_runtime_observed_pending
 ON ana_runtime_observed(phone) WHERE state='pending';
CREATE TABLE IF NOT EXISTS ana_runtime_kb (
 key text PRIMARY KEY, content text NOT NULL, status text NOT NULL DEFAULT 'draft'
 CHECK(status IN ('draft','approved','retired')), source text, reviewer text,
 reviewed_at timestamptz, valid_until timestamptz,
 CHECK(status <> 'approved' OR (NULLIF(source,'') IS NOT NULL AND NULLIF(reviewer,'') IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS ana_runtime_audit (
 id bigserial PRIMARY KEY, phone text, event text NOT NULL,
 detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION ana_runtime_observe(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p->>'phone',913));
 IF COALESCE(p->>'messageId','')='' THEN RAISE EXCEPTION 'messageId obrigatório'; END IF;
 INSERT INTO ana_runtime_observed(phone,message_id,content,source,state)
 VALUES(p->>'phone',p->>'messageId',COALESCE(p->>'conteudo',''),p->>'source',
 CASE WHEN EXISTS(SELECT 1 FROM ana_runtime_outbox
 WHERE phone=p->>'phone' AND provider_id=p->>'messageId' AND status='accepted')
 THEN 'bot' ELSE 'pending' END)
 ON CONFLICT(phone,message_id) DO NOTHING;
 RETURN p;
END $$;

CREATE OR REPLACE FUNCTION ana_runtime_resolve_human(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o ana_runtime_observed%ROWTYPE;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended(p->>'phone',913));
 SELECT * INTO o FROM ana_runtime_observed WHERE phone=p->>'phone'
 AND message_id=p->>'messageId' FOR UPDATE;
 IF NOT FOUND OR o.state<>'pending' THEN RETURN jsonb_build_object('paused',false,'reason','processed'); END IF;
 IF EXISTS(SELECT 1 FROM ana_runtime_outbox WHERE phone=o.phone AND provider_id=o.message_id AND status='accepted') THEN
  UPDATE ana_runtime_observed SET state='bot' WHERE phone=o.phone AND message_id=o.message_id;
  RETURN jsonb_build_object('paused',false,'reason','bot_echo');
 END IF;
 UPDATE ana_runtime_observed SET state='human' WHERE phone=o.phone AND message_id=o.message_id;
 INSERT INTO ana_leads(phone,bot_ativo,human_msg_at,escalado,followup_due_at)
 VALUES(o.phone,false,now(),false,NULL)
 ON CONFLICT(phone) DO UPDATE SET bot_ativo=false,human_msg_at=now(),
 escalado=false,followup_due_at=NULL,updated_at=now();
 INSERT INTO ana_mensagens(phone,role,tipo,conteudo,message_id)
 VALUES(o.phone,'assistant','humano',COALESCE(NULLIF(o.content,''),'[mensagem da equipe]'),o.message_id)
 ON CONFLICT(message_id) WHERE message_id IS NOT NULL DO NOTHING;
 INSERT INTO ana_runtime_audit(phone,event,detail) VALUES(o.phone,'human_takeover',jsonb_build_object('message_id',o.message_id,'source',o.source));
 RETURN jsonb_build_object('paused',true,'reason','human');
END $$;

CREATE OR REPLACE FUNCTION ana_runtime_claim(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE l ana_leads%ROWTYPE; reason text; latest text; norm text;
BEGIN
 IF COALESCE(p->>'phone','') !~ '^[0-9]{10,15}$' OR COALESCE(p->>'send_key','')=''
 OR COALESCE(p->>'owner','')='' OR btrim(COALESCE(p->>'texto',''))='' THEN
  RETURN jsonb_build_object('allowed',false,'reason','invalid_payload');
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p->>'phone',913));
 IF p->>'origin'='BV-01' THEN
  INSERT INTO ana_leads(phone,nome,bot_ativo) VALUES(p->>'phone',NULLIF(p->>'nome',''),true)
  ON CONFLICT(phone) DO NOTHING;
 END IF;
 SELECT * INTO l FROM ana_leads WHERE phone=p->>'phone' FOR UPDATE;
 norm:=lower(regexp_replace(btrim(p->>'texto'),'\s+',' ','g'));
 SELECT message_id INTO latest FROM ana_mensagens WHERE phone=p->>'phone' AND role='user'
 ORDER BY created_at DESC,id DESC LIMIT 1;
 IF l.phone IS NULL THEN reason:='lead_missing';
 ELSIF l.bot_ativo IS DISTINCT FROM true THEN reason:='human_or_bot_paused';
 ELSIF l.opt_out IS TRUE THEN reason:='opt_out';
 ELSIF EXISTS(SELECT 1 FROM ana_runtime_observed WHERE phone=l.phone AND state='pending') THEN reason:='human_event_pending';
 ELSIF p ? 'input_id' AND latest IS DISTINCT FROM p->>'input_id' THEN reason:='stale_input';
 ELSIF p->>'origin'='ANA-01' AND EXISTS(SELECT 1 FROM ana_mensagens m WHERE m.phone=l.phone AND m.message_id=p->>'input_id' AND m.created_at<=l.human_msg_at) THEN reason:='input_before_human';
 ELSIF p ? 'patient_snapshot' AND l.last_patient_msg_at IS DISTINCT FROM NULLIF(p->>'patient_snapshot','')::timestamptz THEN reason:='new_patient_message';
 ELSIF p->>'origin'='ANA-02' AND (l.escalado IS TRUE OR l.agendamento->>'status'='confirmado') THEN reason:='followup_ineligible';
 ELSIF p->>'origin'='ANA-06' AND
  (l.agendamento->>'status' IS DISTINCT FROM 'confirmado' OR l.agendamento->>'origem' IS DISTINCT FROM 'google_agenda'
   OR l.agendamento->>'data' IS DISTINCT FROM p->>'appointment_date'
   OR l.agendamento->>'hora' IS DISTINCT FROM p->>'appointment_time') THEN reason:='appointment_changed';
 ELSIF p->>'origin'='BV-01' AND (l.last_patient_msg_at IS NOT NULL
  OR EXISTS(SELECT 1 FROM tq_boasvindas_enviadas WHERE telefone=l.phone)
  OR EXISTS(SELECT 1 FROM ana_mensagens WHERE phone=l.phone)) THEN reason:='conversation_already_started';
 ELSIF EXISTS(SELECT 1 FROM ana_runtime_outbox WHERE send_key=p->>'send_key') THEN reason:='duplicate_event';
 ELSIF EXISTS(SELECT 1 FROM ana_runtime_outbox WHERE phone=l.phone AND status IN ('reserved','unknown')) THEN reason:='send_in_progress_or_uncertain';
 ELSIF COALESCE((p->>'allow_repeat')::boolean,false)=false AND EXISTS(
  SELECT 1 FROM ana_runtime_outbox WHERE phone=l.phone AND status='accepted' AND message_norm=norm
   AND created_at>now()-interval '30 minutes') THEN reason:='duplicate_content';
 ELSIF p->>'origin'<>'ANA-01' AND EXISTS(
  SELECT 1 FROM ana_runtime_outbox WHERE phone=l.phone AND origin<>'ANA-01' AND status='accepted'
  AND created_at>=date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'
 ) THEN reason:='proactive_already_sent_today';
 END IF;
 IF reason IS NOT NULL THEN
  INSERT INTO ana_runtime_audit(phone,event,detail) VALUES(p->>'phone','send_blocked',
  jsonb_build_object('reason',reason,'origin',p->>'origin','send_key',p->>'send_key'));
  RETURN jsonb_build_object('allowed',false,'reason',reason,'payload',p);
 END IF;
 INSERT INTO ana_runtime_outbox(send_key,phone,origin,owner,status,message_text,message_norm,patient_snapshot,input_id,payload)
 VALUES(p->>'send_key',l.phone,p->>'origin',p->>'owner','reserved',p->>'texto',norm,l.last_patient_msg_at,p->>'input_id',p)
 ON CONFLICT(send_key) DO NOTHING;
 IF NOT FOUND THEN RETURN jsonb_build_object('allowed',false,'reason','duplicate_event','payload',p); END IF;
 RETURN jsonb_build_object('allowed',true,'reason','reserved','payload',p);
END $$;

CREATE OR REPLACE FUNCTION ana_runtime_finish(p jsonb) RETURNS jsonb
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE o ana_runtime_outbox%ROWTYPE; ok boolean; code integer; pid text; st text;
BEGIN
 SELECT * INTO o FROM ana_runtime_outbox WHERE send_key=p->>'send_key';
 IF NOT FOUND THEN RETURN jsonb_build_object('accepted',false,'reason','unknown_key'); END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(o.phone,913));
 SELECT * INTO o FROM ana_runtime_outbox WHERE send_key=p->>'send_key' FOR UPDATE;
 IF o.owner IS DISTINCT FROM p->>'owner' OR o.status<>'reserved' THEN
  RETURN jsonb_build_object('accepted',false,'reason','already_finished_or_wrong_owner');
 END IF;
 code:=COALESCE(NULLIF(p->>'status_code','')::integer,0);
 pid:=NULLIF(p->>'provider_id','');
 ok:=code BETWEEN 200 AND 299 AND pid IS NOT NULL AND COALESCE((p->>'error')::boolean,false)=false;
 st:=CASE WHEN ok THEN 'accepted' WHEN code BETWEEN 400 AND 499 AND code NOT IN(408,429) THEN 'failed' ELSE 'unknown' END;
 UPDATE ana_runtime_outbox SET status=st,provider_id=CASE WHEN ok THEN pid END,http_status=code,finished_at=now()
 WHERE send_key=o.send_key;
 IF ok THEN
  UPDATE ana_runtime_observed SET state='bot' WHERE phone=o.phone AND message_id=pid AND state='pending';
  INSERT INTO ana_mensagens(phone,role,tipo,conteudo,message_id,dados)
  VALUES(o.phone,'assistant','texto',o.message_text,pid,
    COALESCE(o.payload->'dados','{}'::jsonb)||jsonb_build_object('origem',o.origin,'evento',o.origin,'send_key',o.send_key,'provider_accepted',true))
  ON CONFLICT(message_id) WHERE message_id IS NOT NULL DO NOTHING;
  UPDATE ana_leads SET last_bot_msg_at=now(),updated_at=now() WHERE phone=o.phone;
  IF o.origin='BV-01' THEN
   INSERT INTO tq_boasvindas_enviadas(telefone,nome,origem)
   VALUES(o.phone,o.payload->>'nome',o.payload->>'origem') ON CONFLICT(telefone) DO NOTHING;
  END IF;
 ELSE
  INSERT INTO ana_runtime_audit(phone,event,detail) VALUES(o.phone,'send_'||st,
    jsonb_build_object('origin',o.origin,'send_key',o.send_key,'http_status',code));
 END IF;
 RETURN jsonb_build_object('accepted',ok,'status',st,'phone',o.phone,'payload',o.payload);
END $$;
-- As tabelas contêm dados privados. Executar com a mesma role do n8n.
ALTER TABLE ana_runtime_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE ana_runtime_observed ENABLE ROW LEVEL SECURITY;
ALTER TABLE ana_runtime_kb ENABLE ROW LEVEL SECURITY;
ALTER TABLE ana_runtime_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ana_runtime_outbox,ana_runtime_observed,ana_runtime_kb,ana_runtime_audit FROM PUBLIC;
REVOKE ALL ON FUNCTION ana_runtime_claim(jsonb),ana_runtime_finish(jsonb),ana_runtime_observe(jsonb),ana_runtime_resolve_human(jsonb) FROM PUBLIC;
DO $privacy$ DECLARE r text; BEGIN
 FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN
   EXECUTE format('REVOKE ALL ON ana_runtime_outbox,ana_runtime_observed,ana_runtime_kb,ana_runtime_audit FROM %I',r);
   EXECUTE format('REVOKE ALL ON FUNCTION ana_runtime_claim(jsonb),ana_runtime_finish(jsonb),ana_runtime_observe(jsonb),ana_runtime_resolve_human(jsonb) FROM %I',r);
  END IF;
 END LOOP;
END $privacy$;

-- Integração com a função existente, conferida no banco em 14/10/2026.
CREATE OR REPLACE FUNCTION public.ana_claim_followups(p_limite integer DEFAULT 1, p_agora timestamp with time zone DEFAULT now())
 RETURNS TABLE(phone text, nome text, exames jsonb, temperatura text, proxima_acao text, followup_step integer, resumo_interno text)
 LANGUAGE plpgsql
 SET search_path = pg_catalog, public
AS $function$
DECLARE
  v_agora    timestamptz := p_agora;
  v_sp       timestamp   := v_agora AT TIME ZONE 'America/Sao_Paulo';
  v_hora     numeric     := extract(hour FROM v_sp) + extract(minute FROM v_sp) / 60.0;
  v_dow      int         := extract(isodow FROM v_sp);
  v_hoje     date        := v_sp::date;
  v_ini      numeric     := 8.0;
  v_fim      numeric     := 17.5;
  v_atraso   numeric;
  v_teto     int;
  v_teto_h   int;
  v_usado    int;
  v_restante int;
  v_na_hora  int;
  v_ultimo   timestamptz;
  v_min_rest numeric;
  v_gap      numeric;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('ana_followup_claim_v2', 914));
  IF coalesce((SELECT valor FROM ana_config WHERE chave = 'followup_envios_suspensos'), 'true') = 'true'
    THEN RETURN;
  END IF;

  v_atraso := (abs(hashtext(v_hoje::text)) % 46) / 60.0;
  IF v_dow > 5 OR v_hora < v_ini + v_atraso OR v_hora >= v_fim THEN RETURN; END IF;

  SELECT coalesce((SELECT valor FROM ana_config WHERE chave = 'followup_teto_diario'), '0')::int
    INTO v_teto;
  SELECT count(*) INTO v_usado FROM ana_envios_log
   WHERE tipo = 'follow_up'
     AND (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje;
  v_restante := v_teto - v_usado;
  IF v_restante < 1 THEN RETURN; END IF;

  SELECT coalesce((SELECT valor FROM ana_config WHERE chave = 'followup_teto_hora'), '4')::int
    INTO v_teto_h;
  SELECT count(*) INTO v_na_hora FROM ana_envios_log
   WHERE tipo = 'follow_up' AND enviado_em > v_agora - interval '1 hour';
  IF v_na_hora >= v_teto_h THEN RETURN; END IF;

  SELECT max(enviado_em) INTO v_ultimo FROM ana_envios_log
   WHERE tipo IN ('follow_up', 'lembrete_vespera')
     AND (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje;

  IF v_ultimo IS NOT NULL THEN
    v_min_rest := greatest(1, (v_fim - v_hora) * 60);
    v_gap := greatest(8, least(60, (v_min_rest / v_restante) * (0.6 + random() * 0.8)));
    IF v_agora < v_ultimo + make_interval(mins => v_gap::int) THEN RETURN; END IF;
  END IF;

  RETURN QUERY
  WITH elegiveis AS (
    SELECT l.phone AS ph
    FROM ana_leads l
    WHERE l.followup_due_at IS NOT NULL
      AND l.followup_due_at <= v_agora
      AND coalesce(l.opt_out, false)  = false
      AND l.bot_ativo IS TRUE
      AND NOT EXISTS (SELECT 1 FROM ana_runtime_observed h WHERE h.phone=l.phone AND h.state='pending')
      AND NOT EXISTS (SELECT 1 FROM ana_runtime_outbox o WHERE o.phone=l.phone AND o.status IN ('reserved','unknown'))
      AND coalesce(l.escalado, false) = false
      AND l.proxima_acao LIKE 'follow\_up%'
      AND coalesce(l.agendamento->>'status', 'nenhum') NOT IN ('confirmado', 'proposto')
      AND coalesce((l.agendamento->>'realizado')::boolean, false) = false
      AND coalesce(l.status_manual, '') NOT IN ('Agendou', 'Encerrado', 'Não Aplica')
      AND l.last_patient_msg_at IS NOT NULL
      AND coalesce(l.followup_step, 0) < 5
      AND NOT EXISTS (
        SELECT 1 FROM ana_envios_log e
         WHERE e.phone = l.phone
           AND (e.enviado_em AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje)
      AND (SELECT count(*) FROM ana_envios_log e
            WHERE e.phone = l.phone AND e.tipo = 'follow_up'
              AND e.enviado_em > coalesce(l.last_patient_msg_at, '-infinity'::timestamptz)) < 2
    ORDER BY l.followup_due_at
    LIMIT 1
    FOR UPDATE OF l SKIP LOCKED
  ),
  reservados AS (
    UPDATE ana_leads l
       SET followup_due_at = NULL,
           followup_step   = coalesce(l.followup_step, 0) + 1,
           updated_at      = now()
      FROM elegiveis e WHERE l.phone = e.ph
    RETURNING l.phone, l.nome, l.exames, l.temperatura, l.proxima_acao, l.followup_step, l.resumo_interno
  ),
  registrado AS (
    INSERT INTO ana_envios_log (phone, tipo, enviado_em)
    SELECT r.phone, 'follow_up', v_agora FROM reservados r
    RETURNING ana_envios_log.phone
  )
  SELECT r.phone, r.nome, r.exames, r.temperatura, r.proxima_acao, r.followup_step, r.resumo_interno
    FROM reservados r WHERE (SELECT count(*) FROM registrado) >= 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.ana_claim_followups(integer,timestamptz) FROM PUBLIC;
DO $priv_fu$ DECLARE r text; BEGIN FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('REVOKE ALL ON FUNCTION public.ana_claim_followups(integer,timestamptz) FROM %I',r); END IF; END LOOP; END $priv_fu$;

COMMIT;
