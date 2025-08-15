const svc = require("../services/core.service");

async function whoAmI(req, res, next) {
  try {
    const data = await svc.whoAmI();
    res.json(data);
  } catch (err) {
    next(err);
  }
}

async function accounts(req, res, next) {
  try {
    const data = await svc.listAccounts({ top: Number(req.query.top) || 5 });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

module.exports = { whoAmI, accounts };
