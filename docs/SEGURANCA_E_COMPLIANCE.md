# Segurança, privacidade e compliance

## Dados tratados

- Telefone e nome do paciente.
- Conteúdo de mensagens.
- Pedidos médicos, exames e preferências de agenda.
- Estado comercial e resumo interno.

## Princípios

1. Minimização: enviar ao modelo somente o necessário.
2. Finalidade: usar dados apenas para atendimento e melhoria autorizada.
3. Segregação: credenciais em variáveis/credenciais do n8n.
4. Rastreabilidade: mudanças publicadas com versão e descrição.
5. Retenção: revisar periodicamente logs, execuções e tabelas.

## Regras obrigatórias

- Nunca versionar chaves, tokens, telefones ou transcrições reais.
- Não enviar telefone à IA de auditoria.
- Não produzir diagnóstico ou recomendação médica.
- Não prometer resultado clínico.
- Não usar medo, urgência artificial ou pressão indevida.
- Não confirmar disponibilidade de agenda pelo bot.
- Respeitar opt-out imediatamente.
- Escalar emergência, reclamação, privacidade e conflito.

## Revisão de acesso

Trimestralmente:

- revisar usuários do n8n e PostgreSQL;
- rotacionar segredos quando necessário;
- remover credenciais e integrações sem uso;
- verificar escopo das credenciais Google e WhatsApp;
- revisar retenção de execuções do n8n.
