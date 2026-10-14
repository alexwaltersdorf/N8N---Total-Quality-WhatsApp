# Continuidade V2 — repetição e pausa humana

Preparado em 14/10/2026. **Implantação no n8n e alteração de ana_config ainda pendentes.**
O MCP do n8n foi instalado e autenticado localmente; esta revisão não afirma execução ou publicação no ambiente.

## Problema e comportamento esperado

A versão anterior podia classificar a mensagem da atendente pelo campo source, registrar uma resposta antes de confirmar o envio e deixar vários fluxos disputar o mesmo contato. V2 correlaciona o ID retornado pela Evolution e mantém controle de envio no PostgreSQL.

- ANA-01: uma resposta por turno, histórico de 24 mensagens incluindo equipe humana, recusa de resposta de turno antigo, bloco de dados validado, silêncio quando não há pendência.
- Qualquer mensagem fromMe entra em observação. Um eco reconhecido pelo ID pertence à automação; uma mensagem sem esse vínculo pausa a Ana após a janela curta de correlação. A observação pendente já bloqueia novos envios.
- Depois da intervenção humana, a Ana permanece pausada até retomada explícita da equipe. Nova mensagem do paciente não reativa o bot.
- ANA-02, ANA-06 e BV-01 consultam a mesma trava antes de enviar. Um envio incerto não é repetido automaticamente.
- O histórico de resposta enviada só é gravado depois de HTTP 2xx com ID do provedor. Isso confirma aceitação pelo provedor, não entrega ou leitura no aparelho.
- Opt-out não é revertido pelo modelo. A intenção de agendamento não altera o agendamento real da integração com a agenda.

## Arquivos

[Política V2](../conhecimento/continuidade-pausa-v2.md) complementa Clareza V1. Campos desconhecidos devem ser omitidos; o contrato V2 prevalece sobre instruções antigas que exigiam preencher todos os campos.

[Templates](../workflows/manifesto.json) abrangem quatro fluxos de envio. Estão inativos e sem vínculos privados. Não importar diretamente em produção: webhook e planilha contêm marcadores.

[Migração](../runtime/database.sql) cria quatro tabelas de runtime e quatro funções; cria também a tabela legada de boas-vindas somente se ausente, com acesso privado. RLS e revogação de acesso público protegem os registros. A conta usada pelo n8n deve ser a proprietária dos objetos ou receber permissões e políticas privadas adequadas. O script pressupõe schema public, conforme os exports; conferir antes de executar.

[Preparador](../scripts/preparar-atualizacao.cjs) recupera credenciais, webhook, planilha e autenticação HTTP de um export privado da mesma versão. Recusa versão divergente. Nenhum segredo é necessário no GitHub.

## Implantação

1. Exportar os quatro fluxos atuais e a versão publicada, guardar backup privado, registrar IDs e versões. Ler o schema real, índices, função ana_claim_followups e prompt atual. Comparar com o manifesto. Não sobrescrever mudanças posteriores aos exports.
2. Em ambiente isolado, executar a migração com a mesma conta/schema do n8n. Conferir tipos/colunas e índice único parcial de ana_mensagens.message_id. O teste embarcado usa schema mínimo inferido; não substitui esta verificação.
3. Preparar cada fluxo com o script, por exemplo:
   node scripts/preparar-atualizacao.cjs private/ana01-original.json private/ana01-v2.json
4. Validar no n8n com dados fictícios e nós externos simulados, incluindo espera, loops e propagação de itens. Não executar os gatilhos de envio reais para testar.
5. Antes da troca, suspender os quatro fluxos de envio e aguardar execuções antigas terminarem. Preservar webhooks e credenciais. Atualizar rascunhos e comparar nós/conexões antes de publicar. Registrar as versões resultantes e reativar somente os fluxos antes ativos.
6. Atualizar ana_config.system_prompt com backup e comparação de hash: substituir somente o trecho delimitado ANA_CONTINUIDADE_V2_INICIO/FIM; na primeira aplicação, acrescentar o módulo. Preservar catálogo, preços, contexto e módulo Clareza V1. Não duplicar a política. O template ANA-01 também incorpora a política, portanto a integração deve manter uma única cópia efetiva no payload.
7. Ler de volta a configuração e os fluxos publicados. Registrar evidências sanitizadas em conhecimento/implantacao-2026-10-14.json. Somente após esta verificação marcar production_deployed e ana_config_updated como true.

## Operação e limites

A janela de correlação de eco é de 3 segundos. Um eco muito atrasado ou sem ID pode provocar pausa conservadora. Uma requisição HTTP já em andamento não pode ser recolhida se a atendente escrever nesse intervalo; não se promete interrupção absoluta de envio já iniciado.

O controle bloqueia repetição do mesmo evento e texto normalizado recente. A instrução do modelo reduz repetição semântica, mas não oferece garantia matemática para paráfrases.

[Consultas operacionais](../runtime/operacao.sql) mostram envios aceitos, falhos ou incertos e os motivos de bloqueio. Reservas abandonadas e status unknown exigem verificar o recibo do provedor antes de reconciliação. Não apagar a reserva nem reativar indiscriminadamente. A função finish só finaliza reservas; um unknown exige procedimento explícito de reconciliação após conferência, preservando auditoria.

Monitorar: taxa de eventos duplicados, bloqueios por intervenção humana, envios incertos, tempo até retomada, respostas sem dados válidos e contatos proativos por dia. Esses indicadores complementam o ML existente; não são taxas medidas de produção nesta revisão.

Horários e alguns itens do catálogo divergem entre fontes. Estão em [pendências factuais](../conhecimento/pendencias-factuais-v2.json), sem promoção para fatos aprovados. A equipe deve validar fonte, vigência e preparo clínico.

## Validação e rollback

Executar npm install --ignore-scripts e npm test com Node.js. São 42 verificações de runtime em PostgreSQL embarcado, 23 testes do ML existente e 5 de publicação e recuperação de vínculos privados. Nenhum teste manda WhatsApp. Não foi simulada concorrência de várias conexões nem executado o motor n8n.

Em falha de implantação, manter os envios suspensos, restaurar versões privadas e prompt anterior com conferência de hash, avaliar o que já foi aceito pela Evolution e só então reativar. Preservar tabelas de controle e auditoria: apagá-las perde a memória de duplicidade. A reversão dos fluxos remove as proteções V2.
