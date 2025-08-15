const isProd = process.env.NODE_ENV === "production";
const base = { httpOnly: true, secure: isProd, sameSite: "lax", path: "/" };

function setInviteSessionCookie(res, data) {
  res.cookie("invite_session", JSON.stringify(data), {
    ...base,
    signed: true,
    maxAge: 10 * 60 * 1000,
  });
}
function getInviteSession(req) {
  try {
    const raw = req.signedCookies?.invite_session;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function clearInviteSessionCookie(res) {
  res.clearCookie("invite_session", base);
}
function setAuthSessionCookie(res, data) {
  res.cookie("auth_session", JSON.stringify(data), {
    ...base,
    signed: true,
    maxAge: 7 * 24 * 3600 * 1000,
  });
}
function clearAuthSessionCookie(res) {
  res.clearCookie("auth_session", base);
}

module.exports = {
  setInviteSessionCookie,
  getInviteSession,
  clearInviteSessionCookie,
  setAuthSessionCookie,
  clearAuthSessionCookie,
};
