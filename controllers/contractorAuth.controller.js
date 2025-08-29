const jwt = require("jsonwebtoken");
const { AppError } = require("../constants/AppError");
const { CODES } = require("../constants/errorCodes");
const {
  generatePassword,
  sha256Hex,
  generateAndSetPermanentPassword,
  loginContractor,
  logoutContractor,
  hashWithPepper,
  createAccessToken,
  createRefreshToken,
  deleteRefreshTokenByHash,
} = require("../services/contractorAuth.service");
const { safeGet, safeDelete } = require("../utils/apiDataverseUtils");
const wsService = require("../services/ws.service");
const {
  getContractorBidPackageId,
} = require("../services/invitations.service");

const TABLE = "cr97b_contractorauths";
const TOKEN_TABLE = "cr97b_authtokens";
const COL = {
  id: "cr97b_contractorauthid",
  name: "cr97b_name",
  contractorGuidKey: "cr97b_contractorguidkey",
};
const TOKEN_COL = {
  id: "cr97b_authtokenid",
  token: "cr97b_token",
  expiresOn: "cr97b_expireson",
  contractorAuthLookup: "_cr97b_contractorauth_value",
};

const REFRESH_COOKIE_NAME = process.env.REFRESH_COOKIE_NAME || "rt";

function clearRefreshTokenCookie(res) {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });
}

function verifyAccessToken(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token)
    return next(
      new AppError({
        code: CODES.UNAUTHORIZED,
        message: "Access token missing",
        httpStatus: 401,
      })
    );

  jwt.verify(token, process.env.JWT_SECRET, (err, payload) => {
    if (err)
      return next(
        new AppError({
          code: CODES.UNAUTHORIZED,
          message: "Invalid or expired access token",
          httpStatus: 401,
        })
      );
    req.user = payload;
    next();
  });
}

async function generatePasswordForAuth(req, res, next) {
  try {
    const { contractorAuthId } = req.params;
    const { length } = req.body || {};

    if (!contractorAuthId) {
      throw new AppError({
        code: CODES.BAD_REQUEST,
        message: "contractorAuthId is required",
        httpStatus: 400,
      });
    }

    const { password, hashHex } = await generateAndSetPermanentPassword(
      contractorAuthId,
      length ? Number(length) : 16
    );

    res.json({ contractorAuthId, password, hashHex });
  } catch (err) {
    next(err);
  }
}

async function passwordSample(req, res) {
  if (process.env.NODE_ENV === "production")
    return res.status(404).json({ error: "Not available in production" });
  const length = req.query.length ? Number(req.query.length) : 16;
  res.json({
    length,
    password: generatePassword(length),
    hashHex: sha256Hex(generatePassword(length)),
  });
}

async function login(req, res, next) {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      throw new AppError({
        code: CODES.BAD_REQUEST,
        message: "Email and password are required",
        httpStatus: 400,
      });
    }

    const result = await loginContractor(email, password);

    if (!result.success) {
      throw new AppError({
        code: CODES.UNAUTHORIZED,
        message: "Wrong email or password. Please try again.",
        httpStatus: 401,
      });
    }

    // Get contractor's bid package ID for auto-join
    let bidPackageId = null;
    try {
      bidPackageId = await getContractorBidPackageId(result.contractorAuthId);
    } catch (error) {
      console.warn("Could not get bid package for contractor:", error.message);
    }

    // Set refresh token in secure cookie
    res.cookie(REFRESH_COOKIE_NAME, result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(result.refreshExpiresOn),
    });

    res.json({
      accessToken: result.accessToken,
      bidPackageId: bidPackageId,
      message: "Login successful",
    });
  } catch (err) {
    next(err);
  }
}

async function refreshToken(req, res, next) {
  try {
    const refreshTokenRaw = req.cookies?.[REFRESH_COOKIE_NAME];

    if (!refreshTokenRaw) {
      throw new AppError({
        code: CODES.UNAUTHORIZED,
        message: "No refresh token provided.",
        httpStatus: 401,
      });
    }

    const hashedToken = hashWithPepper(refreshTokenRaw);
    const filter = `${TOKEN_COL.token} eq '${hashedToken}'`;
    const resToken = await safeGet(
      `${TOKEN_TABLE}?$filter=${filter}&$select=${TOKEN_COL.id},${TOKEN_COL.expiresOn},${TOKEN_COL.contractorAuthLookup}`
    );
    const tokenRecord = resToken?.data?.value?.[0];
    const nowIso = new Date().toISOString();

    if (!tokenRecord || tokenRecord[TOKEN_COL.expiresOn] < nowIso) {
      if (tokenRecord) {
        await safeDelete(`${TOKEN_TABLE}(${tokenRecord[TOKEN_COL.id]})`);
      }
      clearRefreshTokenCookie(res);
      throw new AppError({
        code: CODES.UNAUTHORIZED,
        message: "Refresh token invalid or expired.",
        httpStatus: 401,
      });
    }

    // Rotate: delete old token
    await safeDelete(`${TOKEN_TABLE}(${tokenRecord[TOKEN_COL.id]})`);

    // Create new refresh token
    const contractorAuthId = tokenRecord[TOKEN_COL.contractorAuthLookup];
    const { refreshToken, expiresOn } = await createRefreshToken(
      contractorAuthId
    );

    // Set new refresh token in cookie
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      expires: new Date(expiresOn),
    });

    res.json({
      accessToken: createAccessToken({ contractorAuthId }),
      message: "Token refreshed successfully",
    });
  } catch (err) {
    next(err);
  }
}

async function logout(req, res, next) {
  try {
    const refreshTokenRaw = req.cookies?.[REFRESH_COOKIE_NAME];

    clearRefreshTokenCookie(res);

    if (refreshTokenRaw) {
      const hashedToken = hashWithPepper(refreshTokenRaw);
      await deleteRefreshTokenByHash(hashedToken);
    }

    if (req.user?.sub) {
      await logoutContractor(req.user.sub);
      if (wsService && wsService.disconnectUser) {
        await wsService.disconnectUser(req.user.sub);
      }
    }

    res.json({
      message: "Logout successful",
      success: true,
    });
  } catch (err) {
    // Even if there's an error, clear the cookie and respond success
    clearRefreshTokenCookie(res);
    console.error("Logout error:", err);
    res.json({
      message: "Logout completed",
      success: true,
    });
  }
}

async function logoutAll(req, res, next) {
  try {
    const contractorAuthId = req.user.sub;
    clearRefreshTokenCookie(res);
    await logoutContractor(contractorAuthId);

    res.json({
      message: "Logged out from all devices successfully",
      success: true,
    });
  } catch (err) {
    next(err);
  }
}

async function getMe(req, res, next) {
  try {
    const contractorAuthId = req.user.sub;
    const profileRes = await safeGet(
      `${TABLE}(${contractorAuthId})` +
        `?$select=${COL.id},${COL.name},${COL.contractorGuidKey}` +
        `&$expand=cr97b_Contractor($select=cr97b_contractorid,cr97b_contractorname,cr97b_phonenumber,cr97b_email,cr97b_address,cr97b_representativename,cr97b_representativetitle,cr97b_registeredon)`
    );

    const data = profileRes.data;
    res.json({
      id: data[COL.id],
      contractor: data.cr97b_Contractor || null,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  verifyAccessToken,
  generatePasswordForAuth,
  passwordSample,
  login,
  refreshToken,
  logout,
  logoutAll,
  getMe,
};
