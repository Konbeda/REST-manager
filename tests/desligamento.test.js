const http = require('http');
const express = require('express');

const { criarDesligamento } = require('../src/utils/desligamento');

// Silencia os logs do módulo sem perder a capacidade de inspecioná-los.
const logSilencioso = { log: jest.fn(), warn: jest.fn() };

function montarServidor() {
  const app = express();

  app.get('/rapido', (req, res) => res.end('ok'));

  app.get('/lento', (req, res) => {
    const timer = setTimeout(() => res.end('terminei'), Number(req.query.ms ?? 500));

    // Se a conexão for derrubada antes da resposta — que é justamente o que
    // o teste de prazo estourado faz —, o timer continuaria correndo e
    // seguraria o event loop depois do teste terminar.
    res.on('close', () => clearTimeout(timer));
  });

  return app.listen(0);
}

const requisicao = (port, caminho, agent) =>
  new Promise((resolve, reject) => {
    http
      .get({ port, path: caminho, agent }, (res) => {
        res.resume();
        res.on('end', () => resolve(res.statusCode));
      })
      .on('error', reject);
  });

describe('Encerramento gracioso', () => {
  let server;
  let port;
  let agent;

  beforeEach(async () => {
    server = montarServidor();
    await new Promise((r) => server.once('listening', r));
    port = server.address().port;
    // keepAlive: é o padrão do HTTP/1.1 e de qualquer cliente moderno.
    agent = new http.Agent({ keepAlive: true });
  });

  afterEach(async () => {
    agent.destroy();

    // Rede de segurança: se um teste falhar antes de chamar desligar(),
    // o servidor ficaria escutando e seguraria o worker do Jest.
    server.closeAllConnections();
    await new Promise((resolve) => server.close(() => resolve()));
  });

  it('responde a requisição que já estava em andamento', async () => {
    const emVoo = requisicao(port, '/lento?ms=500', agent);
    await new Promise((r) => setTimeout(r, 100));

    const desligar = criarDesligamento({
      server,
      esperaBalanceadorMs: 0,
      log: logSilencioso,
    });

    await desligar('TESTE');

    expect(await emVoo).toBe(200);
  });

  it('recusa conexões novas assim que começa', async () => {
    const desligar = criarDesligamento({
      server,
      esperaBalanceadorMs: 0,
      log: logSilencioso,
    });

    const encerrando = desligar('TESTE');
    await new Promise((r) => setTimeout(r, 100));

    await expect(requisicao(port, '/rapido')).rejects.toThrow();

    await encerrando;
  });

  it('avisa o balanceador ANTES de fechar a porta', async () => {
    const ordem = [];

    const desligar = criarDesligamento({
      server,
      esperaBalanceadorMs: 50,
      aoFicharIndisponivel: () => ordem.push('ready=503'),
      fecharBanco: async () => ordem.push('banco fechado'),
      log: logSilencioso,
    });

    await desligar('TESTE');

    // O banco é o último: fechá-lo antes quebraria as requisições em curso.
    expect(ordem).toEqual(['ready=503', 'banco fechado']);
  });

  it('não espera o keepAliveTimeout de conexões que ficam ociosas', async () => {
    // Sem closeIdleConnections, o close() esperaria os 5s do keepAliveTimeout
    // depois que a requisição terminasse.
    await requisicao(port, '/rapido', agent);

    const desligar = criarDesligamento({
      server,
      esperaBalanceadorMs: 0,
      log: logSilencioso,
    });

    const t = Date.now();
    await desligar('TESTE');

    expect(Date.now() - t).toBeLessThan(1000);
  });

  it('derruba o que sobrou quando estoura o prazo', async () => {
    const emVoo = requisicao(port, '/lento?ms=5000', agent).catch(() => 'derrubada');

    await new Promise((r) => setTimeout(r, 100));

    const desligar = criarDesligamento({
      server,
      esperaBalanceadorMs: 0,
      prazoDrenagemMs: 200, // muito menor que os 5s da requisição
      log: logSilencioso,
    });

    const t = Date.now();
    await desligar('TESTE');

    // Não esperou os 5 segundos: desistiu no prazo.
    expect(Date.now() - t).toBeLessThan(2000);
    expect(logSilencioso.warn).toHaveBeenCalledWith(
      expect.stringContaining('excedeu o prazo'),
    );

    await emVoo;
  });

  it('ignora um segundo sinal enquanto já está encerrando', async () => {
    const aoFichar = jest.fn();

    const desligar = criarDesligamento({
      server,
      esperaBalanceadorMs: 50,
      aoFicharIndisponivel: aoFichar,
      log: logSilencioso,
    });

    await Promise.all([desligar('TESTE'), desligar('TESTE'), desligar('TESTE')]);

    // Três sinais, um encerramento só.
    expect(aoFichar).toHaveBeenCalledTimes(1);
  });
});
