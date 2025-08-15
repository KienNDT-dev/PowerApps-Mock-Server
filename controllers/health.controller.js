const svc = require("../services/health.service");

async function ping(req, res) {
  const out = await svc.ping();
  res.json(out);
}

module.exports = { ping };
