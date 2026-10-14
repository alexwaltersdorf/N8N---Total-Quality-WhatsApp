-- ANA v2: operar pelo mesmo schema/credencial usados no n8n.
-- 1. Somente leitura: contagens de pendências, sem conteúdo das conversas.
SELECT origin,status,count(*) AS total,min(created_at) AS mais_antigo
FROM ana_runtime_outbox GROUP BY origin,status ORDER BY origin,status;
SELECT event,detail->>'reason' AS motivo,count(*) AS total
FROM ana_runtime_audit WHERE created_at>now()-interval '24 hours'
GROUP BY event,detail->>'reason' ORDER BY total DESC;
SELECT send_key,right(phone,4) AS final_telefone,origin,status,created_at,http_status
FROM ana_runtime_outbox WHERE status IN ('reserved','unknown')
ORDER BY created_at;
-- Não mudar unknown para failed sem verificar o recibo na Evolution/WhatsApp.
-- Não apagar reservas para "destravar": isso pode permitir duplicidade.
-- Finalizar uma reserva manualmente requer o mesmo owner e um ID real verificado:
-- SELECT ana_runtime_finish(jsonb_build_object(
--   'send_key','CHAVE_VERIFICADA','owner','EXECUCAO_VERIFICADA',
--   'status_code',201,'provider_id','ID_REAL_VERIFICADO','error',false));

-- 2. RETOMADA MANUAL: altera somente UM atendimento. Substituir o telefone.
-- Executar após confirmar que a equipe encerrou o atendimento humano.
-- Não altera opt-out. Recusa pendências e envios ambíguos.
-- A reativação não envia mensagens; aguarde um novo contato do paciente.
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('SUBSTITUIR_PELO_TELEFONE',913));
UPDATE ana_leads l
SET bot_ativo=true,escalado=false,motivo_escalada=NULL,
    followup_due_at=NULL,updated_at=now()
WHERE l.phone='SUBSTITUIR_PELO_TELEFONE'
 AND l.opt_out IS NOT TRUE
 AND NOT EXISTS(SELECT 1 FROM ana_runtime_observed o WHERE o.phone=l.phone AND o.state='pending')
 AND NOT EXISTS(SELECT 1 FROM ana_runtime_outbox o WHERE o.phone=l.phone AND o.status IN ('reserved','unknown'))
RETURNING phone,bot_ativo,opt_out;
COMMIT;
-- Zero linhas: não houve retomada. Investigar antes de mudar as condições.
