const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/contractorAuth.controller");
const verifyToken = require("../middlewares/authMiddleware");

// Public routes
router.post("/:contractorAuthId/password", ctrl.generatePasswordForAuth);
router.post("/login", ctrl.login);
router.post("/refresh", ctrl.refreshToken);
router.post("/logout", ctrl.logout);

// Protected routes
router.get("/me", verifyToken, ctrl.getMe);
router.post("/logout-all", verifyToken, ctrl.logoutAll);

// Developer only routes
router.get("/dev/password-sample", ctrl.passwordSample);

module.exports = router;
