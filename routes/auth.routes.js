const router = require("express").Router();
const { verifyInvite, setPassword } = require("../controllers/auth.controller");
const { authLimiter } = require("../middlewares/rateLimit");

router.post("/verify-invite", authLimiter, verifyInvite);
router.post("/set-password", authLimiter, setPassword);

module.exports = router;
