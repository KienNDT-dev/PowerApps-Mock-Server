const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const {
  safeGet,
  safePost,
  safePatch,
  safeDelete,
} = require("../utils/apiDataverseUtils");
const { log } = require("console");

const TABLE = "cr97b_contractorauths";
const TOKEN_TABLE = "cr97b_authtokens";
const COL = {
  id: "cr97b_contractorauthid",
  email: "cr97b_email",
  passwordHash: "cr97b_passwordhash",
  mustChangePassword: "cr97b_mustchangepassword",
  failedLoginCount: "cr97b_failedlogincount",
  passwordSetOn: "cr97b_passwordseton",
  passwordUpdatedOn: "cr97b_passwordupdatedon",
};
const TOKEN_COL = {
  id: "cr97b_authtokenid",
  label: "cr97b_name",
  token: "cr97b_token",
  expiresOn: "cr97b_expireson",
  contractorAuthBind: "cr97b_ContractorAuth@odata.bind",
  contractorAuthLookup: "_cr97b_contractorauth_value",
};

// Utils
const generatePassword = (length = 20) => {
  const chars =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz0123456789!@#$%^&*_+-=";
  const bytes = crypto.randomBytes(length);
  return [...bytes].map((b) => chars[b % chars.length]).join("");
};

const sha256Hex = (s) =>
  crypto.createHash("sha256").update(s, "utf8").digest("hex");

const hashWithPepper = (token) =>
  sha256Hex(token + (process.env.REFRESH_TOKEN_PEPPER || ""));

// Dataverse helpers
const findAuthByEmail = async (email) => {
  const url = `${TABLE}?$filter=cr97b_Contractor/cr97b_email eq '${email}'&$select=${COL.id},${COL.passwordHash},${COL.failedLoginCount},${COL.mustChangePassword}`;
  return (await safeGet(url)).data.value?.[0] || null;
};
const bumpFailedCount = (id, current = 0) =>
  safePatch(`${TABLE}(${id})`, { [COL.failedLoginCount]: (current || 0) + 1 });
const resetFailedCount = (id) =>
  safePatch(`${TABLE}(${id})`, { [COL.failedLoginCount]: 0 });
const deleteActiveTokens = async (id, nowIso) => {
  const filter = `${TOKEN_COL.contractorAuthLookup} eq '${id}' and ${TOKEN_COL.expiresOn} ge '${nowIso}'`;
  const list =
    (await safeGet(`${TOKEN_TABLE}?$filter=${filter}&$select=${TOKEN_COL.id}`))
      .data.value || [];
  await Promise.all(
    list.map((r) => safeDelete(`${TOKEN_TABLE}(${r[TOKEN_COL.id]})`))
  );
};

// Token creation
const createRefreshToken = async (id, ttlDays = 14) => {
  const tokenPlain = crypto.randomBytes(64).toString("hex");
  await safePost(TOKEN_TABLE, {
    [TOKEN_COL.label]: "Refresh Token",
    [TOKEN_COL.token]: hashWithPepper(tokenPlain),
    [TOKEN_COL.expiresOn]: new Date(
      Date.now() + ttlDays * 86400000
    ).toISOString(),
    [TOKEN_COL.contractorAuthBind]: `/cr97b_contractorauths(${id})`,
  });
  return {
    refreshToken: tokenPlain,
    expiresOn: new Date(Date.now() + ttlDays * 86400000).toISOString(),
  };
};
const createAccessToken = ({ contractorAuthId, email }, ttl = "1d") =>
  jwt.sign({ sub: contractorAuthId, email }, process.env.JWT_SECRET, {
    algorithm: "HS256",
    issuer: "lof-auth",
    audience: "lof-frontend",
    expiresIn: ttl,
  });

// Password management
const setPasswordForAuth = (id, { passwordHash, mustChangePassword }) =>
  safePatch(`${TABLE}(${id})`, {
    [COL.passwordHash]: passwordHash,
    [COL.mustChangePassword]: !!mustChangePassword,
    [COL.passwordSetOn]: new Date().toISOString(),
    [COL.passwordUpdatedOn]: new Date().toISOString(),
    [COL.failedLoginCount]: 0,
  });
const generateAndSetPermanentPassword = async (id, length = 20) => {
  const password = generatePassword(length);
  await setPasswordForAuth(id, {
    passwordHash: sha256Hex(password),
    mustChangePassword: false,
  });
  return { password, hashHex: sha256Hex(password) };
};

// Login
async function loginContractor(email, plainPassword) {
  const auth = await findAuthByEmail(email);
  if (!auth) return { success: false };

  if (
    sha256Hex(plainPassword).toLowerCase() !==
    auth[COL.passwordHash]?.toLowerCase()
  ) {
    await bumpFailedCount(auth[COL.id], auth[COL.failedLoginCount]);
    return { success: false };
  }

  await resetFailedCount(auth[COL.id]);
  await deleteActiveTokens(auth[COL.id], new Date().toISOString());
  const { refreshToken, expiresOn } = await createRefreshToken(auth[COL.id]);
  return {
    success: true,
    contractorAuthId: auth[COL.id],
    email: email,
    accessToken: createAccessToken({ contractorAuthId: auth[COL.id], email }),
    refreshToken,
    refreshExpiresOn: expiresOn,
  };
}

//Logout
async function logoutContractor(contractorAuthId) {
  const nowIso = new Date().toISOString();
  await deleteActiveTokens(contractorAuthId, nowIso);
  return { success: true };
}

async function deleteRefreshTokenByHash(hashedToken) {
  const filter = `${TOKEN_COL.token} eq '${hashedToken}'`;
  const resToken = await safeGet(
    `${TOKEN_TABLE}?$filter=${filter}&$select=${TOKEN_COL.id}`
  );
  const tokenRecord = resToken?.data?.value?.[0];
  if (tokenRecord) {
    await safeDelete(`${TOKEN_TABLE}(${tokenRecord[TOKEN_COL.id]})`);
    return true;
  }
  return false;
}

module.exports = {
  generatePassword,
  sha256Hex,
  hashWithPepper,
  generateAndSetPermanentPassword,
  createAccessToken,
  createRefreshToken,
  loginContractor,
  logoutContractor,
  deleteRefreshTokenByHash,
};
