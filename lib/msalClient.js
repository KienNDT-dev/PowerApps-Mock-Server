const { ConfidentialClientApplication } = require("@azure/msal-node");
const config = require("../config/env");

const msalApp = new ConfidentialClientApplication({
  auth: {
    clientId: config.clientId,
    authority: `https://login.microsoftonline.com/${config.tenantId}`,
    clientSecret: config.clientSecret,
  },
});

async function getToken() {
  const { accessToken } = await msalApp.acquireTokenByClientCredential({
    scopes: [config.scope],
  });
  return accessToken;
}

module.exports = { msalApp, getToken };
