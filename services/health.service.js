async function ping() {
  return { ok: true, ts: new Date().toISOString() };
}
module.exports = { ping };
