# Ana — atendimento WhatsApp da Total Quality

**O cliente quer clareza para dar o próximo passo.**

Documentação revisada em **12/10/2026** a partir de 12 fluxos n8n (125 nós), configuração do banco, testes sintéticos e comparação com o manual anterior.

## Comece aqui

- [Manual técnico e operacional em HTML](docs/manual-ana.html)
- [Auditoria de 12/10/2026 em HTML](auditorias/2026/2026-10-12.html)
- [Módulo de clareza incorporado à Ana](conhecimento/clareza-proximo-passo-v1.md)
- [Registro da implantação e validação](conhecimento/implantacao-2026-10-12.json)
- [Inventário com versões e hashes](docs/inventario-2026-10-12.json)
- [Modelo de relatório semanal em HTML](templates/relatorio-auditoria-semanal.html)
- [Histórico de mudanças](CHANGELOG.md)

Para ler o HTML com o layout completo, baixe o arquivo e abra no navegador. O GitHub pode exibir apenas o código-fonte; GitHub Pages não foi ativado por esta revisão.

## Estado observado

| Fluxo | Papel | IA | Gatilho |
|---|---|---|---|
| ANA-01 | Atendimento e consulta de preços | Responses + transcrição | Webhook |
| ANA-02 | Follow-up | Não; textos fixos | A cada 5min, sujeito às travas do banco |
| ANA-03 | Resumo | Não | 07:00 |
| ANA-04 | Auditoria por amostra | Responses | 00:00 |
| ANA-05 | Sincronização da agenda | Não | 15min + 05:00 |
| ANA-06 | Lembrete de véspera | Não | Dias úteis, 09:00 |
| ANA-07 | Planilha legada | Não | 30min |
| BV-01 / ADS-01 | Boas-vindas / atribuição do site | Não | 1min / webhook |
| FU-US e dois diagnósticos | Rotinas manuais | Não | Não publicados |

O relatório registra 18 achados, incluindo correções ainda pendentes. A atualização do prompt foi aplicada; isso não significa que todos os problemas dos fluxos foram corrigidos.

## Manutenção

1. Manter relatórios em HTML e registrar toda mudança por versão/data.
2. Não publicar credenciais, endpoints secretos, dados de pacientes, transcrições, pinData ou exports brutos.
3. Testar em rascunho isolado, sem destinatário real; preservar o contrato `###DADOS###`.
4. Atualizar manual, inventário, evidências sanitizadas e rollback junto da mudança.
5. GitHub documenta o sistema. Alterar este repositório não altera automaticamente `ana_config` nem publica fluxos no n8n.
6. O registro de agosto é histórico; para estado atual, usar os documentos de outubro.
