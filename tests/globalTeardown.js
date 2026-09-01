// Roda UMA vez, depois de toda a suíte.
module.exports = async function globalTeardown() {
  await globalThis.__MONGO_CONTAINER__?.stop();
};
