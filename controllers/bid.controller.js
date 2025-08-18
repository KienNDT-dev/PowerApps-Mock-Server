const { AppError } = require("../constants/AppError");
const { CODES } = require("../constants/errorCodes");
const {
  createBid,
  updateBid,
  withdrawBid,
  findBidById,
  findBidsByPackageId,
  findBidsByContractor,
  getBidStatistics,
  findContractorBidForPackage,
  getUserPackage,
  validateContractorCanBid,
  getLeaderboardForPackage,
  getBidHistoryForPackage,
  getBidPackageById,
  submitOrUpdateBid,
} = require("../services/bid.service");

// Import invitation service for additional checks
const {
  checkContractorInvitation,
  getContractorBidPackageId,
} = require("../services/invitations.service");

let wsService;
try {
  wsService = require("../services/ws.service");
} catch (err) {
  console.warn("⚠️  WebSocket service not found for bid controller");
}

async function submitBid(req, res, next) {
  try {
    const { bidPackageId, bidPrice, bidName } = req.body;
    const contractorAuthId = req.user.sub;

    if (!bidPackageId || bidPrice === undefined) {
      throw new AppError({
        code: CODES.BAD_REQUEST,
        message: "bidPackageId and bidPrice are required",
        httpStatus: 400,
      });
    }

    if (parseFloat(bidPrice) <= 0) {
      throw new AppError({
        code: CODES.BAD_REQUEST,
        message: "Bid price must be greater than 0",
        httpStatus: 400,
      });
    }

    const invitation = await checkContractorInvitation(
      contractorAuthId,
      bidPackageId
    );
    if (!invitation) {
      throw new AppError({
        code: CODES.FORBIDDEN,
        message: "You are not invited to bid on this package",
        httpStatus: 403,
      });
    }

    const savedBid = await submitOrUpdateBid({
      bidPackageId,
      contractorAuthId,
      bidPrice,
      bidName: bidName || `Bid for package ${bidPackageId}`,
    });

    if (wsService) {
      wsService.publishNewBid({
        bidPackageId,
        bidId: savedBid.id,
        submittedBy: req.user.name || req.user.email,
        amount: parseFloat(bidPrice),
      });
    }

    res.status(201).json({
      success: true,
      bid: savedBid,
      message: "Bid submitted successfully",
    });
  } catch (error) {
    next(error);
  }
}

async function updateBidController(req, res, next) {
  try {
    const { bidId } = req.params;
    const updateFields = req.body;
    const contractorAuthId = req.user.sub;

    if (!bidId) {
      throw new AppError({
        code: CODES.BAD_REQUEST,
        message: "bidId is required",
        httpStatus: 400,
      });
    }

    // Validate bidPrice if provided
    if (
      updateFields.bidPrice !== undefined &&
      parseFloat(updateFields.bidPrice) <= 0
    ) {
      throw new AppError({
        code: CODES.BAD_REQUEST,
        message: "Bid price must be greater than 0",
        httpStatus: 400,
      });
    }

    const updatedBid = await updateBid(bidId, updateFields, contractorAuthId);

    const fieldsChanged = Object.keys(updateFields);

    if (wsService && wsService.publishBidUpdate) {
      wsService.publishBidUpdate({
        bidPackageId:
          updatedBid._cr97b_bidpackage_value || updatedBid.bidPackageId,
        bidId,
        fieldsChanged,
        updatedBy: req.user.email,
      });
    }

    console.log(
      `✅ Bid updated: ${bidId} (fields: ${fieldsChanged.join(", ")}) by ${
        req.user.email
      }`
    );

    res.json({
      success: true,
      bid: updatedBid,
      message: "Bid updated successfully",
    });
  } catch (error) {
    next(error);
  }
}

async function withdrawBidController(req, res, next) {
  try {
    const { bidId } = req.params;
    const contractorAuthId = req.user.sub;

    if (!bidId) {
      throw new AppError({
        code: CODES.BAD_REQUEST,
        message: "bidId is required",
        httpStatus: 400,
      });
    }

    const result = await withdrawBid(bidId, contractorAuthId);

    if (wsService && wsService.publishBidUpdate) {
      const bid = await findBidById(bidId);
      wsService.publishBidUpdate({
        bidPackageId: bid._cr97b_bidpackage_value || bid.bidPackageId,
        bidId,
        fieldsChanged: ["status"],
        updatedBy: req.user.email,
      });
    }

    console.log(`✅ Bid withdrawn: ${bidId} by ${req.user.email}`);

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    next(error);
  }
}

async function getBidsForPackage(req, res, next) {
  try {
    const { bidPackageId } = req.params;
    const { page = 1, limit = 20, status } = req.query;
    const contractorAuthId = req.user.sub;

    if (!bidPackageId) {
      throw new AppError({
        code: CODES.BAD_REQUEST,
        message: "bidPackageId is required",
        httpStatus: 400,
      });
    }

    // Check if contractor is invited to view this package
    const invitation = await checkContractorInvitation(
      contractorAuthId,
      bidPackageId
    );
    if (!invitation) {
      throw new AppError({
        code: CODES.FORBIDDEN,
        message: "You are not authorized to view bids for this package",
        httpStatus: 403,
      });
    }

    const bids = await findBidsByPackageId(bidPackageId, {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
    });

    const statistics = await getBidStatistics(bidPackageId);

    let activeViewers = 0;
    if (wsService && wsService.getRoomClientCount) {
      try {
        activeViewers = await wsService.getRoomClientCount(bidPackageId);
      } catch (err) {
        console.warn("Could not get active viewers count:", err.message);
      }
    }

    res.json({
      success: true,
      bids,
      statistics,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: bids.length,
      },
      activeViewers,
    });
  } catch (error) {
    next(error);
  }
}

async function getMyBids(req, res, next) {
  try {
    const contractorAuthId = req.user.sub;
    const { page = 1, limit = 20, status } = req.query;

    const bids = await findBidsByContractor(contractorAuthId, {
      page: parseInt(page),
      limit: parseInt(limit),
      status,
    });

    res.json({
      success: true,
      bids,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: bids.length,
      },
    });
  } catch (error) {
    next(error);
  }
}

async function getBidById(req, res, next) {
  try {
    const { bidId } = req.params;
    const contractorAuthId = req.user.sub;

    if (!bidId) {
      throw new AppError({
        code: CODES.BAD_REQUEST,
        message: "bidId is required",
        httpStatus: 400,
      });
    }

    const bid = await findBidById(bidId);

    if (!bid) {
      throw new AppError({
        code: CODES.NOT_FOUND,
        message: "Bid not found",
        httpStatus: 404,
      });
    }

    // Check if this is the contractor's own bid or if they're invited to the package
    if (bid._cr97b_contractor_value !== contractorAuthId) {
      const invitation = await checkContractorInvitation(
        contractorAuthId,
        bid._cr97b_bidpackage_value
      );
      if (!invitation) {
        throw new AppError({
          code: CODES.FORBIDDEN,
          message: "You are not authorized to view this bid",
          httpStatus: 403,
        });
      }
    }

    res.json({
      success: true,
      bid,
    });
  } catch (error) {
    next(error);
  }
}

async function getBidPackageStatistics(req, res, next) {
  try {
    const { bidPackageId } = req.params;
    const contractorAuthId = req.user.sub;

    if (!bidPackageId) {
      throw new AppError({
        code: CODES.BAD_REQUEST,
        message: "bidPackageId is required",
        httpStatus: 400,
      });
    }

    // Check if contractor is invited to view this package
    const invitation = await checkContractorInvitation(
      contractorAuthId,
      bidPackageId
    );
    if (!invitation) {
      throw new AppError({
        code: CODES.FORBIDDEN,
        message: "You are not authorized to view statistics for this package",
        httpStatus: 403,
      });
    }

    const statistics = await getBidStatistics(bidPackageId);

    res.json({
      success: true,
      statistics,
    });
  } catch (error) {
    next(error);
  }
}

async function getMyBidForPackage(req, res, next) {
  try {
    const { bidPackageId } = req.params;
    const contractorAuthId = req.user.sub;

    if (!bidPackageId) {
      throw new AppError({
        code: CODES.BAD_REQUEST,
        message: "bidPackageId is required",
        httpStatus: 400,
      });
    }

    // Check if contractor is invited to this package
    const invitation = await checkContractorInvitation(
      contractorAuthId,
      bidPackageId
    );
    if (!invitation) {
      throw new AppError({
        code: CODES.FORBIDDEN,
        message: "You are not invited to bid on this package",
        httpStatus: 403,
      });
    }

    const bid = await findContractorBidForPackage(
      contractorAuthId,
      bidPackageId
    );

    res.json({
      success: true,
      bid,
      hasBid: !!bid,
      message: bid ? "Bid found" : "No bid found for this package",
    });
  } catch (error) {
    next(error);
  }
}

async function getMyBidPackage(req, res, next) {
  try {
    const contractorAuthId = req.user.sub;

    const bidPackage = await getUserPackage(contractorAuthId);

    if (!bidPackage) {
      return res.json({
        success: true,
        bidPackage: null,
        message: "No bid package assigned to you",
      });
    }

    res.json({
      success: true,
      bidPackage,
      message: "Bid package retrieved successfully",
    });
  } catch (error) {
    next(error);
  }
}

async function getLeaderboard(req, res, next) {
  try {
    const { bidPackageId } = req.params;
    const contractorAuthId = req.user.sub;

    if (!bidPackageId) {
      throw new AppError({
        code: CODES.BAD_REQUEST,
        message: "bidPackageId is required",
        httpStatus: 400,
      });
    }

    const leaderboard = await getLeaderboardForPackage(
      bidPackageId,
      contractorAuthId
    );

    let viewers = 0;
    if (wsService && wsService.getRoomClientCount) {
      try {
        viewers = await wsService.getRoomClientCount(bidPackageId);
      } catch (err) {
        console.warn("Could not get active viewers count:", err.message);
      }
    }

    let deadline = null;
    if (typeof getBidPackageById === "function") {
      const pkg = await getBidPackageById(bidPackageId);
      deadline = pkg?.cr97b_submissiondeadline || null;
    }

    res.json({
      bidPackageId,
      deadline,
      viewers,
      bids: leaderboard,
    });
  } catch (error) {
    next(error);
  }
}

async function getBidHistory(req, res, next) {
  try {
    const { bidPackageId } = req.params;

    if (!bidPackageId) {
      throw new AppError({
        code: CODES.BAD_REQUEST,
        message: "bidPackageId is required",
        httpStatus: 400,
      });
    }

    // Optionally: check invitation here if needed

    const events = await getBidHistoryForPackage(bidPackageId);

    res.json({
      events,
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  submitBid,
  updateBid: updateBidController,
  withdrawBid: withdrawBidController,
  getBidsForPackage,
  getMyBids,
  getBidById,
  getBidPackageStatistics,
  getMyBidForPackage,
  getMyBidPackage,
  getLeaderboard,
  getBidHistory,
};
