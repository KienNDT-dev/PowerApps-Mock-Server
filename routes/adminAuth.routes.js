const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/adminAuth.controller");

router.post("/login", ctrl.adminLogin);

module.exports = router;
