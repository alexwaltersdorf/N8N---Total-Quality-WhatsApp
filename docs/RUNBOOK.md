# Runbook operacional

## Verificação diária

1. Confirmar que os fluxos 01 a 04 estão ativos.
2. Verificar falhas nas últimas 24 horas.
3. Conferir fila de leads escalados e follow-ups vencidos.
4. Confirmar recebimento do resumo das 07h e da auditoria das 07h10.
5. Investigar erros de autenticação, timeout e limite de API.

## Teste mínimo após mudança

### Fluxo 01

- Texto de primeiro contato.
- Foto legível de pedido médico.
- PDF legível.
- Áudio curto.
- Exame com preço cadastrado.
- Exame não cadastrado.
- Pedido de agendamento.
- Opt-out.
- Intervenção humana.

### Fluxo 02

- Lead elegível para cada etapa da cadência.
- Lead com opt-out.
- Lead já agendado.
- Falha da IA e retentativa.
- Falha no envio do WhatsApp.

### Fluxo 04

- Dia com conversas.
- Dia sem conversas.
- Volume acima do limite.
- Comparação com auditoria anterior.

## Procedimento de publicação

1. Abrir o fluxo no editor do n8n.
2. Confirmar se já existem alterações não publicadas.
3. Revisar nós modificados e credenciais referenciadas.
4. Salvar como rascunho.
5. Executar testes proporcionais ao risco.
6. Publicar com descrição objetiva.
7. Acompanhar as primeiras execuções.
8. Registrar a mudança no `CHANGELOG.md`.

## Rollback

1. Abrir **Version History**.
2. Identificar a última versão estável.
3. Restaurar e publicar a versão anterior.
4. Pausar o fluxo se houver risco de mensagem incorreta ao paciente.
5. Documentar incidente, impacto, causa e correção.

## Escalonamento

Interromper publicação e escalar quando houver:

- exposição de dados pessoais;
- preço incorreto;
- confirmação indevida de agenda;
- conselho ou diagnóstico médico;
- repetição em massa de mensagens;
- aumento anormal de custo ou tokens;
- falha recorrente de credenciais.
