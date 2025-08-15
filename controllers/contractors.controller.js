const svc = require("../services/contractors.service");

// List
async function list(req, res, next) {
  try {
    const { select, top, filter, orderby } = req.query;
    const data = await svc.listContractors({
      select,
      top: top ? Number(top) : 5,
      filter,
      orderby,
    });
    res.json(data);
  } catch (err) {
    next(err);
  }
}

// Get by id
async function getById(req, res, next) {
  try {
    const { id } = req.params; // GUID or business code
    const { select } = req.query;
    const data = await svc.getContractor(id, { select });
    res.json(data);
  } catch (err) {
    if (err.code === "NOT_FOUND")
      return res.status(404).json({ error: "Not found" });
    next(err);
  }
}

module.exports = {
  list,
  getById,
};
