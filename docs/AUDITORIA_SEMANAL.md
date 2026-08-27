# Auditoria semanal

Executar uma vez por semana, preferencialmente antes de qualquer atualização de prompt ou modelo.

## 1. Confiabilidade

- [ ] Taxa de sucesso por fluxo.
- [ ] Quantidade de execuções com erro.
- [ ] Erros por nó e causa raiz.
- [ ] Mensagens duplicadas ou perdidas.
- [ ] Retentativas funcionando.
- [ ] Tempo médio e percentil 95 das execuções.

## 2. Qualidade do atendimento

- [ ] Amostra de pelo menos 20 conversas.
- [ ] Respostas corretas e acolhedoras.
- [ ] Nenhum preço inventado.
- [ ] Nenhuma agenda confirmada pelo bot.
- [ ] Escalonamento correto.
- [ ] Opt-out respeitado.
- [ ] `###DADOS###` válido e removido da mensagem ao paciente.

## 2.1 Indicadores comerciais e de agenda

- [ ] Novos contatos únicos cuja primeira interação ocorreu no período.
- [ ] Contatos únicos que receberam orçamento válido no período.
- [ ] Solicitações de agendamento registradas no atendimento.
- [ ] Pacientes únicos com evento confirmado no Google Agenda.
- [ ] Calendários e intervalo de datas consultados registrados no relatório.
- [ ] Eventos cancelados/excluídos separados dos agendamentos confirmados.

Não tratar solicitação ou intenção como agendamento concluído. O indicador “pacientes agendados” exige confirmação por evento existente no Google Agenda.

## 3. IA e tokens

- [ ] Tokens de entrada e saída por chamada.
- [ ] Custo médio por conversa.
- [ ] Custo de imagem, PDF e auditoria.
- [ ] Histórico respeitando o limite de 12 mensagens.
- [ ] Auditoria respeitando limites de pacientes e caracteres.
- [ ] Prompt sem repetições ou exemplos obsoletos.
- [ ] `reasoning` e `max_output_tokens` adequados à tarefa.

## 4. Banco de dados

- [ ] Crescimento das tabelas de mensagens e auditorias.
- [ ] Follow-ups vencidos ou presos.
- [ ] Leads escalados sem atendimento.
- [ ] Preços ativos e atualizados.
- [ ] Índices das consultas mais frequentes.

## 5. Segurança e compliance

- [ ] Nenhuma credencial em código ou logs.
- [ ] Nenhum telefone enviado à auditoria de IA.
- [ ] Dados médicos minimizados.
- [ ] Sem diagnóstico, promessa de resultado ou indução por medo.
- [ ] Acessos e credenciais revisados.

## 6. Decisão semanal

Classifique cada achado:

| Prioridade | Critério | Prazo |
|---|---|---|
| P0 | Risco ao paciente, vazamento ou envio em massa incorreto | Imediato |
| P1 | Preço/agendamento incorreto ou fluxo principal indisponível | 24 horas |
| P2 | Custo, lentidão ou perda de conversão relevante | 7 dias |
| P3 | Melhoria incremental ou documentação | Próximo ciclo |

## Registro da semana

Copie [o modelo de relatório](../templates/RELATORIO_AUDITORIA_SEMANAL.md), preencha e salve em `auditorias/AAAA/AAAA-MM-DD.md`.

Não altere o prompt apenas porque uma resposta isolada foi ruim. Exija padrão recorrente, hipótese clara, teste controlado e critério de reversão.
