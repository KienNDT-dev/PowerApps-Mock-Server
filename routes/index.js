const express = require("express");
const core = require("./core.routes");
const contractor = require("./contractor.routes");
const contractorAuth = require("./contractorAuth.routes");
const bid = require("./bid.routes");

const router = express.Router();
router.use("/core", core);
router.use("/contractor", contractor);
router.use("/contractor-auth", contractorAuth);
router.use("/bid", bid);

module.exports = router;
