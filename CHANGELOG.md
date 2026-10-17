# Changelog

## 2026-10-17 — Perfil e cadência V1 (preparado, não implantado)

### Alterado nos templates (ANA-01, ANA-02) e no SQL

- **Cadência de follow-up:** orçamento ou pergunta sem resposta passa a ser retomado em ~3h (`follow_up_d1`), não mais em D+1. Sequência de 3 passos: FU1 ~3h, FU2 +1 dia (preferência de dia/período, coleta domiciliar quando há laboratório e lembrete de *parar*), FU3 +2 dias com encerramento respeitoso. Prazos longos (`follow_up_d3/d7/d30`) só quando a pessoa pede. Horário comercial, tetos, travas, pausa e opt-out continuam valendo.
- **Correção:** o ANA-02 gravava `proxima_acao='aguardar_resposta'` após cada follow-up, mas `ana_claim_followups()` só seleciona `follow_up%`. Na prática, só o primeiro follow-up era enviado. Agora o passo seguinte fica como `follow_up_d1` e o último como `encerrar`.
- `ana_claim_followups()`: até 3 follow-ups sem resposta (antes 2) e no máximo 3 passos (antes 5).
- **Contrato ###DADOS###:** novos campos `estilo` (D/I/S/C/N), `estilo_confianca`, `objecao` e `estado_emocional`, validados no `Extrair Resposta`. O estilo só é gravado com confiança ≥ 0,6. Os campos são preservados quando omitidos e devolvidos à Ana no contexto do turno seguinte. Módulo de prompt em [perfil-cadencia-v1.md](conhecimento/perfil-cadencia-v1.md): personaliza o estilo, nunca os fatos, e não registra dado de saúde.
- `ana_leads`: colunas `estilo`, `estilo_confianca`, `objecao`, `estado_emocional` com CHECK de domínio (aditivo e idempotente).
- 7 testes novos (52 de runtime, 23 de ML e 6 de publicação aprovados). Nenhuma mensagem enviada.

### Para implantar

1. Backup; aplicar `runtime/database.sql`.
2. Preparar ANA-01 e ANA-02 com `scripts/preparar-atualizacao.cjs` a partir dos exports privados atuais (baseline no manifesto), publicar e reler as versões.
3. Leads em andamento com `followup_step` 3 ou 4 da cadência antiga deixam de receber follow-up. Isso é intencional e não exige limpeza.
4. Acompanhar por 2 semanas: taxa de resposta por passo, opt-outs por passo e agendamentos em 7 dias.

## 2026-10-14

### Implantado e verificado no n8n

- Quatro templates corrigidos com controle compartilhado de duplicidade, pausa humana persistente e aceitação do provedor antes de registrar a resposta.
- Política Continuidade V2: reaproveitar histórico, evitar perguntas repetidas, permitir silêncio e preservar dados anteriores e agendamentos reais.
- Migração com RLS, testes sintéticos, preparação privada com verificação de versão e guia de implantação/rollback.
- Horários e itens de catálogo divergentes permanecem pendentes de validação factual.
- 74 verificações locais aprovadas (45 runtime, 23 ML, 6 publicação), seis cenários no motor n8n com serviços externos simulados e ensaio no PostgreSQL real com rollback.
- Schema, índices e triggers conferidos. Função real de follow-up passou a respeitar pausa, observações pendentes e reservas incertas; busca retorna o snapshot do paciente. Limites de 20/dia e 4/hora preservados.
- Quatro versões publicadas e relidas como ativas. Prompt atualizado com backup, preservação literal dos marcadores e hash de leitura idêntico ao esperado. Rotina temporária de manutenção arquivada.
- Nenhuma mensagem enviada a pacientes pelos testes. Registros de versão e evidências sanitizadas constam no arquivo de implantação de 14/10.

## 2026-10-12

### Auditados e documentados

- 12 fluxos, 125 nós; 18 achados com evidências e critérios de aceite.
- Manual e auditoria em HTML; inventário versionado e modelo semanal HTML.
- Corrigidas as descrições de ANA-02 (texto fixo), ANA-04 (00:00), catálogo de fluxos, anonimização e cálculo de cache.
- O registro de agosto foi preservado como histórico. O texto antigo de remoção de telefones se refere ao campo explícito; a transcrição livre ainda pode conter identificadores.

### Aplicado à base ativa

- Módulo Clareza V1 anteposto ao `ana_config.system_prompt`, com backup, comparação de hash e leitura de verificação.
- Oito cenários sintéticos da IA concluídos; oito reproduções locais de riscos documentadas. Nenhum teste enviou WhatsApp a pacientes.
- Textos fixos, regras SQL, catálogo e fluxos de produção não foram corrigidos por esta implantação; permanecem no plano priorizado.


## 2026-08-27

### Alterado

- ANA 01 migrado de Claude para GPT-5.6 Luna via Responses API.
- Leitura de imagem e PDF convertida para entrada multimodal da OpenAI.
- Function calling de preços adaptado para a Responses API.
- Histórico do atendimento limitado a 12 mensagens.
- ANA 02 migrado para GPT-5.6 Luna e histórico limitado a 12 mensagens.
- ANA 04 migrado para GPT-5.6 Luna.
- ANA 04 passou a limitar pacientes, tamanho das transcrições e contexto total.
- Telefones removidos do conteúdo enviado à IA de auditoria.

### Documentado

- Arquitetura, contratos, catálogo, runbook, custos, segurança e auditoria semanal.
