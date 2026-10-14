# Changelog

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
