// Encerramento gracioso, em etapas.
//
// Fica separado do index.js porque assim dá para testá-lo chamando a função
// diretamente, sem depender de sinais do sistema operacional — que, aliás,
// nem existem de verdade no Windows.

const PADRAO = {
  // Tempo mentindo "não estou pronto" antes de fechar, para o balanceador
  // sondar o /ready, falhar o threshold e nos tirar do pool. Se fecharmos
  // antes disso, ele ainda nos considera saudáveis e manda requisições
  // para uma porta que já não existe.
  esperaBalanceadorMs: Number(process.env.SHUTDOWN_ESPERA_LB_MS ?? 3000),

  // Prazo máximo para drenar. Depois disso, conexões ainda ativas são
  // derrubadas: melhor sacrificar algumas requisições do que estourar o
  // prazo do supervisor e levar SIGKILL no meio de tudo.
  prazoDrenagemMs: Number(process.env.SHUTDOWN_PRAZO_MS ?? 10000),
};

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function criarDesligamento({
  server,
  aoFicharIndisponivel,
  fecharBanco,
  log = console,
  ...opcoes
}) {
  const { esperaBalanceadorMs, prazoDrenagemMs } = { ...PADRAO, ...opcoes };

  let emAndamento = false;

  return async function desligar(motivo) {
    // Um segundo SIGTERM não deve reiniciar o processo de desligamento.
    if (emAndamento) return;
    emAndamento = true;

    log.log(`${motivo} recebido — iniciando encerramento`);

    // 1) Sair do balanceador antes de qualquer outra coisa.
    aoFicharIndisponivel?.();
    await espera(esperaBalanceadorMs);

    // 2) Recusar conexões novas; as em andamento seguem até responder.
    const drenagem = new Promise((resolve) => server.close(resolve));

    // Conexões keep-alive que ficam ociosas DEPOIS daqui seguram o close()
    // até o keepAliveTimeout. Derrubá-las em laço evita esperar à toa.
    //
    // unref(): estes timers não devem, eles próprios, manter o processo vivo.
    // Sem isso, o mecanismo criado para encerrar viraria motivo para não
    // encerrar — que é exatamente o oposto do objetivo.
    const derrubarOciosas = setInterval(() => server.closeIdleConnections(), 50);
    derrubarOciosas.unref();

    // 3) Prazo rígido: se a drenagem travar, derruba tudo e segue.
    const estouro = setTimeout(() => {
      log.warn('drenagem excedeu o prazo, derrubando conexões restantes');
      server.closeAllConnections();
    }, prazoDrenagemMs);
    estouro.unref();

    await drenagem;

    clearInterval(derrubarOciosas);
    clearTimeout(estouro);

    // 4) Só agora o banco: fechá-lo antes quebraria as requisições em curso.
    await fecharBanco?.();

    log.log('encerrado de forma limpa');
  };
}

module.exports = { criarDesligamento, PADRAO };
