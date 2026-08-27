# ANA — Automação de Atendimento WhatsApp

Documentação técnica dos fluxos n8n usados pela ANA, assistente virtual da Total Quality.

Este repositório existe para manter a operação auditável, facilitar atualizações e acompanhar semanalmente desempenho, custo, segurança e qualidade do atendimento.

## Visão geral

| Fluxo | Função | IA | Execução |
|---|---|---|---|
| ANA 01 — Atendimento WhatsApp | Atendimento, leitura de pedidos, preços, escalonamento e gravação do lead | GPT-5.6 Luna | Webhook |
| ANA 02 — Follow-up Carinhoso | Cadência automática D+1 a D+30 | GPT-5.6 Luna | A cada 5 minutos |
| ANA 03 — Resumo Diário | Resumo operacional por WhatsApp | Não utiliza IA | Diariamente às 07h |
| ANA 04 — Auditoria de Atendimento | Avaliação diária de qualidade, vendas e compliance | GPT-5.6 Luna | Diariamente às 07h10 |
| ANA 05 — Diagnóstico de agendas | Validação de calendários e cobertura | Não utiliza IA | Manual |
| ANA 05 — Diagnóstico alternativo | Segunda versão do diagnóstico de agendas | Não utiliza IA | Manual |

## Documentação

- [Arquitetura e fluxo de dados](docs/ARQUITETURA.md)
- [Catálogo detalhado dos fluxos](docs/FLUXOS.md)
- [Runbook operacional](docs/RUNBOOK.md)
- [Auditoria semanal](docs/AUDITORIA_SEMANAL.md)
- [Desempenho e custos](docs/CUSTOS_E_DESEMPENHO.md)
- [Segurança, privacidade e compliance](docs/SEGURANCA_E_COMPLIANCE.md)
- [Histórico de mudanças](CHANGELOG.md)

## Regras de manutenção

1. Nunca versionar chaves de API, credenciais, telefones ou dados de pacientes.
2. Exportar o JSON de um fluxo somente após remover credenciais e dados de execução.
3. Testar em rascunho antes de publicar no n8n.
4. Registrar toda mudança funcional no `CHANGELOG.md`.
5. Executar a [auditoria semanal](docs/AUDITORIA_SEMANAL.md) antes de alterar modelo, prompt ou regras comerciais.
6. Preservar os contratos internos descritos em [FLUXOS.md](docs/FLUXOS.md).

## Estado documentado

Última revisão técnica: **27/08/2026**.

Os fluxos 01, 02 e 04 utilizam a OpenAI Responses API com `gpt-5.6-luna`. Os fluxos 03 e 05 são determinísticos e não devem receber IA sem justificativa técnica e financeira.
