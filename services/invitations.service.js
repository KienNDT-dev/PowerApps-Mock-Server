const {
  safeGet,
  safePost,
  safePatch,
  safeDelete,
} = require("../utils/apiDataverseUtils");

const INVITATIONS_TABLE = "cr97b_invitations";
const CONTRACTOR_AUTH_TABLE = "cr97b_contractorauths";
const CONTRACTOR_TABLE = "cr97b_contractors";

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

const CONTRACTOR_COL = {
  id: "cr97b_contractorid",
  name: "cr97b_name",
  authId: "cr97b_authid",
  taxCode: "cr97b_taxcode",
  phoneNumber: "cr97b_phonenumber",
  email: "cr97b_email",
  address: "cr97b_address",
  representativeName: "cr97b_representativename",
  representativeTitle: "cr97b_representativetitle",
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

// Get contractor details from contractor auth ID
const getContractorByAuthId = async (contractorAuthId) => {
  try {
    // First get the contractor ID from auth table
    const contractorId = await getContractorIdFromAuth(contractorAuthId);
    if (!contractorId) {
      return null;
    }

    // Then get contractor details using the contractor ID
    const selectFields = [
      CONTRACTOR_COL.name,
      CONTRACTOR_COL.id,
      CONTRACTOR_COL.taxCode,
      CONTRACTOR_COL.phoneNumber,
      CONTRACTOR_COL.email,
      CONTRACTOR_COL.address,
      CONTRACTOR_COL.representativeName,
      CONTRACTOR_COL.representativeTitle,
    ].join(",");

    const url = `${CONTRACTOR_TABLE}(${contractorId})?$select=${selectFields}`;
    const result = await safeGet(url);
    return result.data || null;
  } catch (error) {
    console.error("Error getting contractor by auth ID:", error);
    return null;
  }
};

// Find invitation by contractor auth ID
const findInvitationByContractor = async (
  contractorAuthId,
  bidPackageId = null
) => {
  try {
    const contractorId = await getContractorIdFromAuth(contractorAuthId);
    console.log("🔍 Contractor ID from auth:", contractorId);

    if (!contractorId) {
      console.log("❌ No contractor ID found for auth:", contractorAuthId);
      return null;
    }

    // Build filter - include bid package if specified
    let filter = `${INVITATION_COL.contractorLookup} eq '${contractorId}'`;
    if (bidPackageId) {
      filter += ` and ${INVITATION_COL.bidPackageLookup} eq '${bidPackageId}'`;
    }

    // Add ordering to get most recent invitation
    const url = `${INVITATIONS_TABLE}?$filter=${filter}&$select=${Object.values(
      INVITATION_COL
    ).join(",")}&$orderby=${INVITATION_COL.invitedOn} desc&$top=1`;

    console.log("🔍 Invitation query URL:", url);

    const result = await safeGet(url);
    const invitation = result.data.value?.[0] || null;

    console.log(
      "📋 Found invitation:",
      invitation
        ? {
            id: invitation[INVITATION_COL.id],
            bidPackage: invitation[INVITATION_COL.bidPackageLookup],
            invitedOn: invitation[INVITATION_COL.invitedOn],
          }
        : "None"
    );

    return invitation;
  } catch (error) {
    console.error("❌ Error finding invitation by contractor:", error);
    return null;
  }
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

// Get bid package ID for contractor - get the most recent active invitation
const getContractorBidPackageId = async (contractorAuthId) => {
  try {
    console.log("🎯 Getting bid package ID for contractor:", contractorAuthId);

    const contractorId = await getContractorIdFromAuth(contractorAuthId);
    if (!contractorId) {
      console.log("❌ No contractor found for auth ID:", contractorAuthId);
      return null;
    }

    // Get all invitations for this contractor, ordered by most recent
    const filter = `${INVITATION_COL.contractorLookup} eq '${contractorId}'`;
    const url = `${INVITATIONS_TABLE}?$filter=${filter}&$select=${Object.values(
      INVITATION_COL
    ).join(",")}&$orderby=${INVITATION_COL.invitedOn} desc&$top=5`; // Get up to 5 recent invitations

    console.log("🔍 Query URL:", url);

    const result = await safeGet(url);
    const invitations = result.data.value || [];

    console.log("📋 Found invitations:", invitations.length);

    if (invitations.length === 0) {
      console.log("⚠️ No invitations found for contractor");
      return null;
    }

    // Return the most recent invitation's bid package ID
    const mostRecentInvitation = invitations[0];
    const bidPackageId = mostRecentInvitation[INVITATION_COL.bidPackageLookup];

    console.log("✅ Most recent bid package ID:", bidPackageId);
    return bidPackageId;
  } catch (error) {
    console.error("❌ Error getting contractor bid package ID:", error);
    return null;
  }
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
  getContractorByAuthId,
  INVITATION_COL,
  INVITATION_BIND,
  INVITATIONS_TABLE,
  CONTRACTOR_COL,
  CONTRACTOR_TABLE,
};
