# Catálogo dos fluxos

## ANA 01 — Atendimento WhatsApp

- **ID n8n:** `XRUqhdO1QCyBBHbf`
- **Gatilho:** webhook da mensageria.
- **Modelo:** `gpt-5.6-luna`.
- **Endpoint:** `POST https://api.openai.com/v1/responses`.
- **Histórico:** até 12 mensagens recentes mais o resumo interno.

### Responsabilidades

1. Filtrar eventos válidos e mensagens duplicadas.
2. Verificar bot ativo e intervenção humana.
3. Normalizar texto, imagem, áudio e PDF.
4. Ler pedidos médicos em imagem/PDF com saída estruturada.
5. Transcrever áudio.
6. Carregar prompt, histórico e lead.
7. Consultar preços por function calling.
8. Gerar resposta e `###DADOS###`.
9. Salvar mensagem, atualizar lead e escalar quando necessário.
10. Enviar mensagens em bolhas.

### Limites de IA

- Pedido médico: `max_output_tokens: 500`, `reasoning: none`.
- Atendimento: `max_output_tokens: 1200`, `reasoning: low`.
- Histórico limitado a 12 mensagens.

### Pontos críticos

- O system prompt armazenado no banco é extenso; revisar trimestralmente.
- Qualquer mudança no schema da ferramenta `consultar_precos` exige atualizar a segunda rodada.
- Validar imagem, PDF, áudio, preço encontrado e preço ausente após alterações.

## ANA 02 — Follow-up Carinhoso

- **ID n8n:** `Z0iuQURxQ4MvGZTT`
- **Gatilho:** a cada 5 minutos.
- **Modelo:** `gpt-5.6-luna`.
- **Histórico:** até 12 mensagens.
- **Saída máxima:** 600 tokens.

### Cadência

| Etapa | Momento | Objetivo |
|---|---|---|
| 1 | D+1 | Dúvida leve, sem cobrança |
| 2 | D+3 | Motivo novo e preferência de data/turno |
| 3 | D+7 | Prova social verdadeira e pergunta gentil |
| 4 | D+14 | Encerramento acolhedor, facilitando o “não” |
| 5 | D+30 | Último toque e porta aberta |

### Proteções

- Não repetir mensagens anteriores.
- Não inventar valores.
- Não confirmar horário disponível.
- Falha da IA adia a tentativa em uma hora sem travar a fila.
- Opt-out, escalonamento ou agendamento encerram a cadência.

## ANA 03 — Resumo Diário

- **ID n8n:** `MJXKG1KvNPNA30b2`
- **Gatilho:** diariamente às 07h.
- **IA:** não utiliza.
- **Fonte:** `SELECT ana_resumo_diario() AS texto`.

O relatório é gerado no PostgreSQL e distribuído por WhatsApp. Manter determinístico. Os destinatários atualmente são configurados no nó de código; recomenda-se migrá-los para tabela ou variável de ambiente.

## ANA 04 — Auditoria de Atendimento

- **ID n8n:** `wX92vCvWPEOheINW`
- **Gatilho:** diariamente às 07h10.
- **Modelo:** `gpt-5.6-luna`.
- **Saída máxima:** 2.200 tokens.

### Escopo

- Humanização e rapport.
- Método de vendas Vende-C.
- Precisão de preços, exames e horários.
- Compliance CFM e LGPD.
- Conversão e oportunidades perdidas.
- Atuação da equipe humana.
- Evolução contra a auditoria anterior.

### Limites

- Máximo de 40 pacientes.
- Máximo de 6.000 caracteres por transcrição.
- Máximo de 100.000 caracteres no conjunto.
- Auditoria anterior limitada a 3.000 caracteres.
- Telefones não são enviados ao modelo.

## ANA 05 — Diagnóstico de agendas

- **ID n8n:** `AcYmak8VDuAgHw54`
- **IA:** não utiliza.
- **Execução:** manual.

Lista calendários disponíveis, lê eventos e gera relatório de cobertura. Não adicionar IA sem necessidade comprovada.

## ANA 05 — Diagnóstico alternativo

- **ID n8n:** `4yC3Wk8bKexOVdH1`
- **Nome atual:** contém “Claude”, mas não possui chamada real de IA.
- **Execução:** manual.

É uma segunda versão do diagnóstico de agendas. Avaliar consolidação com o outro ANA 05 para reduzir manutenção duplicada.
