const crypto = require("crypto");
const argon2 = require("argon2");
const {
  findInviteByTokenHash,
  markInviteViewed,
} = require("../services/invitations.service");
const { setPasswordForAuth } = require("../services/contractorAuth.service");
const {
  setInviteSessionCookie,
  getInviteSession,
  clearInviteSessionCookie,
  setAuthSessionCookie,
} = require("../lib/cookies");

const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

exports.verifyInvite = async (req, res, next) => {
  try {
    const token = (req.body && req.body.token) || "";
    if (typeof token !== "string" || token.length < 24 || token.length > 512) {
      return res.json({ ok: false, code: "INVALID" });
    }

    const tokenHash = sha256(String(process.env.INVITE_PEPPER || "") + token);
    const invite = await findInviteByTokenHash(tokenHash);
    if (!invite) return res.json({ ok: false, code: "INVALID" });

    const now = new Date();
    if (invite.tokenExpiresOn && now > new Date(invite.tokenExpiresOn)) {
      return res.json({ ok: false, code: "EXPIRED" });
    }
    if (invite.tokenUsedOn) return res.json({ ok: false, code: "USED" });
    if (invite.status === "Revoked")
      return res.json({ ok: false, code: "REVOKED" });

    await markInviteViewed(invite.id);

    setInviteSessionCookie(res, {
      invitationId: invite.id,
      contractorId: invite.contractorId,
      contractorAuthId: invite.contractorAuthId,
    });

    return res.json({
      ok: true,
      contractorName: invite.contractorName,
      invitationId: invite.id,
      needsPassword:
        !invite.auth?.passwordHash || invite.auth?.mustChangePassword === true,
      emailHint: invite.auth?.email?.replace(/(.{2}).+(@.+)/, "$1****$2"),
    });
  } catch (err) {
    next(err);
  }
};

exports.setPassword = async (req, res, next) => {
  try {
    const session = getInviteSession(req);
    if (!session) {
      return res
        .status(401)
        .json({ message: "Session expired. Open your email link again." });
    }

    const password = (req.body && req.body.password) || "";
    const strong =
      typeof password === "string" &&
      password.length >= 12 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /\d/.test(password) &&
      /[^A-Za-z0-9]/.test(password);
    if (!strong)
      return res
        .status(400)
        .json({ message: "Password does not meet requirements." });

    const hash = await argon2.hash(
      String(process.env.PASSWORD_PEPPER || "") + password,
      {
        type: argon2.argon2id,
        timeCost: 3,
        memoryCost: 1 << 16,
        parallelism: 1,
      }
    );

    await setPasswordForAuth(session.contractorAuthId, {
      passwordHash: hash,
      mustChangePassword: false,
    });

    // await markInviteUsed(session.invitationId); // optional single-use flip

    clearInviteSessionCookie(res);
    setAuthSessionCookie(res, { contractorId: session.contractorId });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};
