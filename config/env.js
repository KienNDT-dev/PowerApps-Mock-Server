require("dotenv").config();

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const config = {
  tenantId: requireEnv("TENANT_ID"),
  clientId: requireEnv("CLIENT_ID"),
  clientSecret: requireEnv("CLIENT_SECRET"),
  dataverseUrl: requireEnv("DATAVERSE_URL").replace(/\/$/, ""),
  apiVersion: process.env.API_VERSION || "v9.2",
  port: parseInt(process.env.PORT || "5000", 10),
};

config.scope = `${config.dataverseUrl}/.default`;

module.exports = config;
