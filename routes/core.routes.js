const express = require("express");
const ctrl = require("../controllers/core.controller");
const router = express.Router();

router.get("/whoami", ctrl.whoAmI);
router.get("/accounts", ctrl.accounts);

module.exports = router;
