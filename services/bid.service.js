const crypto = require("crypto");
const {
  safeGet,
  safePost,
  safePatch,
  safeDelete,
} = require("../utils/apiDataverseUtils");

// Import invitation service
const {
  getContractorBidPackageId,
  checkContractorInvitation,
  getContractorIdFromAuth,
} = require("./invitations.service");

const TABLE = "cr97b_commoditybids";
const PACKAGE_TABLE = "cr97b_bidpackages";

const COL = {
  id: "cr97b_commoditybidid",
  name: "cr97b_name",
  bidPrice: "cr97b_unitprice",
  contractorLookup: "_cr97b_contractor_value",
  bidPackageLookup: "_cr97b_bidpackage_value",
  submittedOn: "cr97b_submittedon",
  updatedOn: "cr97b_updatedon",
};

const BIND_COL = {
  contractorBind: "cr97b_Contractor@odata.bind",
  bidPackageBind: "cr97b_BidPackage@odata.bind",
};

const PACKAGE_COL = {
  id: "cr97b_bidpackageid",
  code: "cr97b_name",
  name: "cr97b_bidpackagecode",
  description: "cr97b_description",
  deadline: "cr97b_submissiondeadline",
  createdAt: "cr97b_createdon",
};

const generateBidReference = () => {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString("hex");
  return `BID-${timestamp}-${random}`.toUpperCase();
};

const findBidById = async (bidId) => {
  const url = `${TABLE}(${bidId})?$select=${Object.values(COL).join(",")}`;
  const result = await safeGet(url);
  return result.data || null;
};

const findBidsByPackageId = async (bidPackageId, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const filter = `${COL.bidPackageLookup} eq '${bidPackageId}'`;
  const url = `${TABLE}?$filter=${filter}&$select=${Object.values(COL).join(
    ","
  )}&$orderby=${COL.submittedOn} desc&$top=${limit}&$skip=${skip}`;
  const result = await safeGet(url);
  return result.data.value || [];
};

const findBidsByContractor = async (contractorAuthId, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const filter = `${COL.contractorAuthLookup} eq '${contractorAuthId}'`;
  const url = `${TABLE}?$filter=${filter}&$select=${Object.values(COL).join(
    ","
  )}&$orderby=${COL.submittedOn} desc&$top=${limit}&$skip=${skip}`;
  const result = await safeGet(url);
  return result.data.value || [];
};

const checkExistingBid = async (contractorAuthId, bidPackageId) => {
  const filter = `${COL.contractorAuthLookup} eq '${contractorAuthId}' and ${COL.bidPackageLookup} eq '${bidPackageId}'`;
  const url = `${TABLE}?$filter=${filter}&$select=${COL.id}&$top=1`;
  const result = await safeGet(url);
  return result.data.value?.[0] || null;
};

const findContractorBidForPackage = async (contractorAuthId, bidPackageId) => {
  const contractorId = await getContractorIdFromAuth(contractorAuthId);
  if (!contractorId) return null;

  const filter = `${COL.contractorLookup} eq '${contractorId}' and ${COL.bidPackageLookup} eq '${bidPackageId}'`;
  const url = `${TABLE}?$filter=${filter}&$select=${Object.values(COL).join(
    ","
  )}&$top=1`;
  const result = await safeGet(url);
  return result.data.value?.[0] || null;
};

const getBidPackageById = async (bidPackageId) => {
  const url = `${PACKAGE_TABLE}(${bidPackageId})?$select=${Object.values(
    PACKAGE_COL
  ).join(",")}`;
  const result = await safeGet(url);
  return result.data || null;
};

const validateContractorCanBid = async (contractorAuthId, bidPackageId) => {
  const invitation = await checkContractorInvitation(
    contractorAuthId,
    bidPackageId
  );
  if (!invitation) {
    throw new Error("You are not invited to bid on this package");
  }
  return true;
};

const createBid = async ({
  bidPackageId,
  contractorAuthId,
  bidPrice,
  bidName = "",
}) => {
  await validateContractorCanBid(contractorAuthId, bidPackageId);

  const existingBid = await checkExistingBid(contractorAuthId, bidPackageId);
  if (existingBid) {
    throw new Error(
      "You already have a bid for this package. Please update your existing bid instead."
    );
  }

  const bidPackage = await getBidPackageById(bidPackageId);
  if (!bidPackage) {
    throw new Error("Bid package not found");
  }

  if (
    bidPackage[PACKAGE_COL.deadline] &&
    new Date(bidPackage[PACKAGE_COL.deadline]) < new Date()
  ) {
    throw new Error("Bid package deadline has passed");
  }

  const finalBidName =
    bidName || `Bid by Contractor for ${bidPackage[PACKAGE_COL.name]}`;

  const contractorId = await getContractorIdFromAuth(contractorAuthId);
  if (!contractorId) {
    throw new Error("Contractor not found for this user");
  }

  const bidData = {
    [COL.name]: finalBidName,
    [COL.bidPrice]: parseFloat(bidPrice),
    [COL.submittedOn]: new Date().toISOString(),
    [COL.updatedOn]: new Date().toISOString(),
    [COL.contractorBind]: `/cr97b_contractors(${contractorId})`,
    [COL.bidPackageBind]: `/cr97b_bidpackages(${bidPackageId})`,
  };

  const response = await safePost(TABLE, bidData);

  const locationHeader =
    response.headers?.location || response.headers?.Location;
  const bidId = locationHeader?.match(/\(([^)]+)\)/)?.[1];

  return {
    id: bidId,
    name: finalBidName,
    bidPackageId,
    contractorAuthId,
    bidPrice: parseFloat(bidPrice),
    submittedOn: bidData[COL.submittedOn],
    updatedOn: bidData[COL.updatedOn],
  };
};

const updateBid = async (bidId, updateFields, contractorAuthId = null) => {
  const existingBid = await findBidById(bidId);
  if (!existingBid) {
    throw new Error("Bid not found");
  }

  if (contractorAuthId) {
    const contractorId = await getContractorIdFromAuth(contractorAuthId);
    if (existingBid[COL.contractorLookup] !== contractorId) {
      throw new Error("You can only update your own bids");
    }
  }

  const updateData = {
    [COL.updatedOn]: new Date().toISOString(),
  };

  if (updateFields.bidPrice !== undefined) {
    updateData[COL.bidPrice] = parseFloat(updateFields.bidPrice);
  }
  if (updateFields.bidName !== undefined) {
    updateData[COL.name] = updateFields.bidName;
  }

  await safePatch(`${TABLE}(${bidId})`, updateData);

  return await findBidById(bidId);
};

const submitOrUpdateBid = async ({
  bidPackageId,
  contractorAuthId,
  bidPrice,
  bidName = "",
}) => {
  await validateContractorCanBid(contractorAuthId, bidPackageId);

  const contractorId = await getContractorIdFromAuth(contractorAuthId);
  if (!contractorId) {
    throw new Error("Contractor not found for this user");
  }

  const existingBid = await findContractorBidForPackage(
    contractorAuthId,
    bidPackageId
  );

  if (existingBid) {
    return await updateBid(
      existingBid[COL.id],
      { bidPrice, bidName },
      contractorAuthId
    );
  } else {
    return await createBid({
      bidPackageId,
      contractorAuthId,
      bidPrice,
      bidName,
    });
  }
};

const withdrawBid = async (bidId, contractorAuthId) => {
  const existingBid = await findBidById(bidId);
  if (!existingBid) {
    throw new Error("Bid not found");
  }

  if (existingBid[COL.contractorAuthLookup] !== contractorAuthId) {
    throw new Error("You can only withdraw your own bids");
  }

  const withdrawnName = `[WITHDRAWN] ${existingBid[COL.name]}`;

  await safePatch(`${TABLE}(${bidId})`, {
    [COL.name]: withdrawnName,
    [COL.updatedOn]: new Date().toISOString(),
  });

  return {
    success: true,
    message: "Bid withdrawn successfully",
    bidPackageId: existingBid[COL.bidPackageLookup],
  };
};

const getBidStatistics = async (bidPackageId) => {
  const filter = `${COL.bidPackageLookup} eq '${bidPackageId}' and not startswith(${COL.name}, '[WITHDRAWN]')`;
  const url = `${TABLE}?$filter=${filter}&$select=${COL.bidPrice},${COL.name}`;
  const result = await safeGet(url);
  const bids = result.data.value || [];

  const stats = {
    totalBids: bids.length,
    averagePrice: 0,
    lowestPrice: null,
    highestPrice: null,
  };

  if (bids.length > 0) {
    const prices = bids
      .map((bid) => bid[COL.bidPrice])
      .filter((price) => price != null);

    if (prices.length > 0) {
      stats.averagePrice =
        prices.reduce((sum, price) => sum + price, 0) / prices.length;
      stats.lowestPrice = Math.min(...prices);
      stats.highestPrice = Math.max(...prices);
    }
  }

  return stats;
};

const getUserPackage = async (contractorAuthId) => {
  const bidPackageId = await getContractorBidPackageId(contractorAuthId);

  if (!bidPackageId) {
    return null;
  }

  const bidPackage = await getBidPackageById(bidPackageId);

  if (!bidPackage) {
    return null;
  }

  const existingBid = await checkExistingBid(contractorAuthId, bidPackageId);

  return {
    ...bidPackage,
    hasBid: !!existingBid,
    myBid: existingBid || null,
    canBid:
      !existingBid &&
      (!bidPackage[PACKAGE_COL.deadline] ||
        new Date(bidPackage[PACKAGE_COL.deadline]) > new Date()),
  };
};

const getLeaderboardForPackage = async (bidPackageId, myContractorAuthId) => {
  const filter = `${COL.bidPackageLookup} eq '${bidPackageId}' and not startswith(${COL.name}, '[WITHDRAWN]')`;
  const url = `${TABLE}?$filter=${filter}&$select=${Object.values(COL).join(
    ","
  )}&$orderby=${COL.submittedOn} desc&$top=500`;
  const result = await safeGet(url);
  const allBids = result.data.value || [];

  const latestBidMap = new Map();
  for (const bid of allBids) {
    const contractorId = bid[COL.contractorAuthLookup];
    if (!latestBidMap.has(contractorId)) {
      latestBidMap.set(contractorId, bid);
    }
  }

  let leaderboard = Array.from(latestBidMap.values()).map((bid) => ({
    bidId: bid[COL.id],
    contractorId: bid[COL.contractorAuthLookup],
    contractorAlias:
      bid[COL.contractorAuthLookup] === myContractorAuthId
        ? "Me"
        : "Contractor",
    amount: bid[COL.bidPrice],
    currency: "VND",
    isMine: bid[COL.contractorAuthLookup] === myContractorAuthId,
    submittedOn: bid[COL.submittedOn],
  }));

  leaderboard.sort((a, b) => {
    if (a.amount !== b.amount) return a.amount - b.amount;
    return new Date(a.submittedOn) - new Date(b.submittedOn);
  });

  leaderboard = leaderboard.map((bid, idx) => ({
    ...bid,
    rank: idx + 1,
    contractorAlias: bid.isMine ? "Me" : `Contractor ${idx + 1}`,
  }));

  return leaderboard;
};

const getBidHistoryForPackage = async (bidPackageId) => {
  const filter = `${COL.bidPackageLookup} eq '${bidPackageId}'`;
  const url = `${TABLE}?$filter=${filter}&$select=${Object.values(COL).join(
    ","
  )}&$orderby=${COL.submittedOn} asc&$top=500`;
  const result = await safeGet(url);
  const allBids = result.data.value || [];

  const events = allBids.map((bid) => {
    let type = "submitted";
    if (bid[COL.name]?.startsWith("[WITHDRAWN]")) {
      type = "withdrawn";
    } else if (
      bid[COL.updatedOn] &&
      bid[COL.updatedOn] !== bid[COL.submittedOn]
    ) {
      type = "updated";
    }
    return {
      ts: bid[COL.updatedOn] || bid[COL.submittedOn],
      type,
      bidId: bid[COL.id],
      contractorId: bid[COL.contractorAuthLookup],
      amount: bid[COL.bidPrice],
    };
  });

  return events;
};

module.exports = {
  generateBidReference,
  findBidById,
  findBidsByPackageId,
  findBidsByContractor,
  findContractorBidForPackage,
  checkExistingBid,
  getBidPackageById,
  createBid,
  updateBid,
  withdrawBid,
  getBidStatistics,
  getUserPackage,
  validateContractorCanBid,
  getLeaderboardForPackage,
  getBidHistoryForPackage,
  submitOrUpdateBid,
  COL,
  PACKAGE_COL,
};
