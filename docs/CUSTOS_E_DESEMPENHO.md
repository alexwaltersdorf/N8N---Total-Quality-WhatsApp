# Custos e desempenho

## Modelo padrão

Os fluxos de IA usam `gpt-5.6-luna`, indicado para alto volume e sensibilidade a custo.

Preço de referência documentado na migração de 27/08/2026:

| Tipo | Preço por 1 milhão de tokens |
|---|---:|
| Entrada | US$ 0,20 |
| Entrada em cache | US$ 0,02 |
| Saída | US$ 1,20 |

Consultar a página oficial antes de projeções financeiras, pois preços podem mudar.

## Fórmula

```text
custo = (tokens_entrada / 1.000.000 × preço_entrada)
      + (tokens_cache / 1.000.000 × preço_cache)
      + (tokens_saida / 1.000.000 × preço_saida)
```

## Indicadores semanais

| Indicador | Meta inicial |
|---|---:|
| Custo médio por conversa textual | Monitorar tendência |
| Histórico do atendimento | ≤ 12 mensagens |
| Saída do atendimento | ≤ 1.200 tokens |
| Saída do follow-up | ≤ 600 tokens |
| Saída da auditoria | ≤ 2.200 tokens |
| Transcrição por paciente na auditoria | ≤ 6.000 caracteres |
| Tempo p95 do atendimento | Definir após 4 semanas de dados |

## Otimização segura

1. Remover repetições do prompt antes de reduzir regras críticas.
2. Usar resumo interno em vez de histórico ilimitado.
3. Definir saída estruturada onde houver leitura documental.
4. Usar `reasoning: none` para extração e `low` para atendimento.
5. Não adicionar IA a tarefas determinísticas.
6. Monitorar qualidade junto com custo; menor custo com mais retrabalho não é ganho.
