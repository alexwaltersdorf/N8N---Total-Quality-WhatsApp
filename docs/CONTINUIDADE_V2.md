# Continuidade V2 — repetição e pausa humana

ANA-01, ANA-02, ANA-06 e BV-01 estão ativos nas versões registradas em [evidências da implantação](../conhecimento/implantacao-2026-10-14.json). Os controles de turno e de envio mantêm a pausa da Ana após intervenção humana.

## Problema e comportamento esperado

ANA-01 correlaciona mensagens de saída com IDs da Evolution, mantém controle de envio no PostgreSQL e pausa a automação quando uma mensagem enviada pela equipe humana é observada.

- ANA-01: uma resposta por turno, histórico incluindo mensagens humanas, recusa de resposta de turno antigo e silêncio quando não há pendência.
- Uma mensagem fromMe reconhecida como eco da automação não assume o turno. Uma mensagem da equipe sem vínculo de envio da Ana pausa o bot; a pausa permanece até retomada explícita.
- ANA-02, ANA-06 e BV-01 consultam a mesma trava antes de enviar. Um envio incerto não é repetido automaticamente.
- O histórico de resposta enviada só é gravado depois de HTTP 2xx com ID do provedor. Isso confirma aceitação pelo provedor, não entrega ou leitura.
- Opt-out não é revertido pelo modelo. A intenção de agendamento não altera o agendamento real da integração com a agenda.

## Fatos e protocolos

Consulte [a atualização institucional e os preparos aprovados](../conhecimento/atualizacao-institucional-2026-10-14.md) e os registros estruturados em conhecimento/dados-clinica-2026-10-14.json.
