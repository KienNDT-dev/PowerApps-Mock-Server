const {
  safeGet,
  safePost,
  safePatch,
  safeDelete,
} = require("../utils/apiDataverseUtils");

const INVITATIONS_TABLE = "cr97b_invitations";
const CONTRACTOR_AUTH_TABLE = "cr97b_contractorauths";

const INVITATION_COL = {
  id: "cr97b_invitationid",
  contractorLookup: "_cr97b_contractor_value",
  bidPackageLookup: "_cr97b_bidpackage_value",
  invitedOn: "cr97b_senton",
};

const CONTRACTOR_AUTH_COL = {
  id: "cr97b_contractorauthid",
  contractorLookup: "_cr97b_contractor_value",
  authId: "cr97b_contractorauthid",
};

const INVITATION_BIND = {
  contractorBind: "cr97b_Contractor@odata.bind",
  bidPackageBind: "cr97b_BidPackage@odata.bind",
};

// Get contractor ID from contractor auth ID
const getContractorIdFromAuth = async (contractorAuthId) => {
  const filter = `${CONTRACTOR_AUTH_COL.authId} eq '${contractorAuthId}'`;
  const url = `${CONTRACTOR_AUTH_TABLE}?$filter=${filter}&$select=${CONTRACTOR_AUTH_COL.contractorLookup}&$top=1`;

  const result = await safeGet(url);
  const contractorAuth = result.data.value?.[0];

  return contractorAuth
    ? contractorAuth[CONTRACTOR_AUTH_COL.contractorLookup]
    : null;
};

// Find invitation by contractor auth ID
const findInvitationByContractor = async (contractorAuthId) => {
  const contractorId = await getContractorIdFromAuth(contractorAuthId);

  if (!contractorId) {
    return null;
  }

  const filter = `${INVITATION_COL.contractorLookup} eq '${contractorId}'`;
  const url = `${INVITATIONS_TABLE}?$filter=${filter}&$select=${Object.values(
    INVITATION_COL
  ).join(",")}&$top=1`;

  const result = await safeGet(url);
  return result.data.value?.[0] || null;
};

// Find all invitations for a bid package
const findInvitationsByBidPackage = async (bidPackageId, options = {}) => {
  const { page = 1, limit = 20 } = options;
  const skip = (page - 1) * limit;

  const filter = `${INVITATION_COL.bidPackageLookup} eq '${bidPackageId}'`;
  const url = `${INVITATIONS_TABLE}?$filter=${filter}&$select=${Object.values(
    INVITATION_COL
  ).join(",")}&$orderby=${
    INVITATION_COL.invitedOn
  } desc&$top=${limit}&$skip=${skip}`;

  const result = await safeGet(url);
  return result.data.value || [];
};

// Get bid package ID for contractor
const getContractorBidPackageId = async (contractorAuthId) => {
  const invitation = await findInvitationByContractor(contractorAuthId);
  return invitation ? invitation[INVITATION_COL.bidPackageLookup] : null;
};

// Check if contractor is invited to bid package
const checkContractorInvitation = async (contractorAuthId, bidPackageId) => {
  const contractorId = await getContractorIdFromAuth(contractorAuthId);

  if (!contractorId) {
    return null;
  }

  const filter = `${INVITATION_COL.contractorLookup} eq '${contractorId}' and ${INVITATION_COL.bidPackageLookup} eq '${bidPackageId}'`;
  const url = `${INVITATIONS_TABLE}?$filter=${filter}&$select=${INVITATION_COL.id}&$top=1`;

  const result = await safeGet(url);
  return result.data.value?.[0] || null;
};

// Create new invitation
const createInvitation = async ({ contractorAuthId, bidPackageId }) => {
  const contractorId = await getContractorIdFromAuth(contractorAuthId);

  if (!contractorId) {
    throw new Error("Contractor not found for auth ID");
  }

  const existingInvitation = await checkContractorInvitation(
    contractorAuthId,
    bidPackageId
  );
  if (existingInvitation) {
    throw new Error("Contractor already invited to this bid package");
  }

  const invitationData = {
    [INVITATION_COL.invitedOn]: new Date().toISOString(),
    [INVITATION_BIND.contractorBind]: `/cr97b_contractors(${contractorId})`,
    [INVITATION_BIND.bidPackageBind]: `/cr97b_bidpackages(${bidPackageId})`,
  };

  const response = await safePost(INVITATIONS_TABLE, invitationData);

  const locationHeader =
    response.headers?.location || response.headers?.Location;
  const invitationId = locationHeader?.match(/\(([^)]+)\)/)?.[1];

  return {
    id: invitationId,
    contractorAuthId,
    contractorId,
    bidPackageId,
    invitedOn: invitationData[INVITATION_COL.invitedOn],
  };
};

// Get invitation statistics for bid package
const getInvitationStatistics = async (bidPackageId) => {
  const filter = `${INVITATION_COL.bidPackageLookup} eq '${bidPackageId}'`;
  const url = `${INVITATIONS_TABLE}?$filter=${filter}&$select=${INVITATION_COL.id}`;

  const result = await safeGet(url);
  const invitations = result.data.value || [];

  return {
    totalInvitations: invitations.length,
  };
};

module.exports = {
  findInvitationByContractor,
  findInvitationsByBidPackage,
  getContractorBidPackageId,
  checkContractorInvitation,
  createInvitation,
  getInvitationStatistics,
  getContractorIdFromAuth,
  INVITATION_COL,
  INVITATION_BIND,
  INVITATIONS_TABLE,
};
