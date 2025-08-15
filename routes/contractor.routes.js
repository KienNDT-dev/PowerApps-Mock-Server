const express = require("express");
const ctrl = require("../controllers/contractors.controller");
const { generateFormeplease } = require("../services/contractorAuth.service");
const router = express.Router();

router.get("/", ctrl.list);
router.get("/:id", ctrl.getById);

module.exports = router;
