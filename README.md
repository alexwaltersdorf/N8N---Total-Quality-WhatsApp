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



## Machine Learning — implantação de 12/10/2026

- [Manual do módulo ML em HTML](ml/manual.html)
- [Workflow recorrente de ML sem credenciais](ml/workflow-ana-ml.json)
- [Workflow de download HTML e fila privada](ml/workflow-relatorio-html.json)
- [Schema e funções privadas](ml/database.sql), [consultas operacionais](ml/operacao.sql) e [patch de integração ANA04](ml/integrar-ana04.py)
- [Núcleo JavaScript](ml/core.cjs) e [testes reproduzíveis](ml/tests.cjs)
- [Dashboard HTML de procura por exames e consultas](ml/dashboard.cjs): filtros por data, tipo, fonte e agrupamento; exames de sangue reunidos em Laboratorial, com detalhamento individual opcional. Contagens deduplicadas por contato/dia/categoria; a data é a da mensagem, não da realização do procedimento.

O novo fluxo analisa indicadores a cada 15 minutos, treina K-Means diariamente e prioriza a amostra do ANA04 com comparação. Sentimento, nota e lacunas são heurísticas identificadas; anomalias não comprovam falha. Follow-ups permanecem em observação, sem envio ou edição automática da base. Relatórios reais e referências internas ficam no ambiente privado. A auditoria anterior continua válida para os achados ainda pendentes.
