const jwt = require("jsonwebtoken");

exports.adminLogin = (req, res) => {
  const { adminSecret } = req.body;
  if (adminSecret !== process.env.ADMIN_SECRET) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  const token = jwt.sign({ role: "admin" }, process.env.JWT_SECRET, {
    expiresIn: "2h",
    subject: "admin",
  });
  res.json({ success: true, accessToken: token });
};
