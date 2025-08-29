const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/bid.controller");
const verifyToken = require("../middlewares/authMiddleware");
const requireAdmin = require("../middlewares/requireAdmin");
const { authLimiter } = require("../middlewares/rateLimit");

// Protected routes - all bid routes require authentication
router.use(verifyToken);

// Bid management routes
router.post("/", authLimiter, ctrl.submitBid);
router.get("/my-bids", ctrl.getMyBids);
router.get("/my-bid-package", ctrl.getMyBidPackage);

// Make this route admin-only
router.get("/package/:bidPackageId", requireAdmin, ctrl.getBidsForPackage);

router.get("/package/:bidPackageId/statistics", ctrl.getBidPackageStatistics);
router.get("/:bidId", ctrl.getBidById);
router.patch("/:bidId", authLimiter, ctrl.updateBid);
router.patch("/:bidId/withdraw", authLimiter, ctrl.withdrawBid);
router.get("/bid-packages/:bidPackageId/leaderboard", ctrl.getLeaderboard);
router.get("/bid-packages/:bidPackageId/history", ctrl.getBidHistory);

module.exports = router;
