require('dotenv').config();
const axios = require('axios');
const { ConfidentialClientApplication } = require('@azure/msal-node');

// ----- Config helpers -----
function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

const tenantId = requireEnv('tenantId');
const clientId = requireEnv('clientId');
const clientSecret = requireEnv('client_secret');
const scope = requireEnv('scope'); // e.g. https://yourorg.crmX.dynamics.com/.default
const baseUrl = scope.replace(/\/\.default$/, ''); // https://yourorg.crmX.dynamics.com

// ----- Auth (MSAL) -----
const msalApp = new ConfidentialClientApplication({
  auth: {
    clientId,
    authority: `https://login.microsoftonline.com/${tenantId}`,
    clientSecret,
  },
});

async function getToken() {
  const { accessToken } = await msalApp.acquireTokenByClientCredential({ scopes: [scope] });
  return accessToken;
}

// ----- Axios instance -----
function api(token) {
  return axios.create({
    baseURL: `${baseUrl}/api/data/v9.2/`,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    validateStatus: s => s < 500,
  });
}

// ----- Tests -----
async function testWhoAmI(http) {
  const { data } = await http.get('WhoAmI()');
  console.log('✅ WhoAmI:', data);
}

async function testAccounts(http) {
  const { data } = await http.get('accounts?$select=name,accountid&$top=5');
  console.log('✅ First 5 accounts:', data.value);
}

async function testContractors(http) {
  // TODO: set these to your real values
  const ENTITY_SET = 'cr97b_contractors'; // confirm in Table > Properties > Entity set name
  const SELECT = '$select=cr97b_contractorid,cr97b_contractorname,cr97b_address'; // use your column logical names

  const { data, status } = await http.get(`${ENTITY_SET}?${SELECT}&$top=5`);
  if (status >= 400) {
    console.warn('⚠️ Contractor query failed. Check entity set & column logical names.');
    console.warn('Details:', data);
  } else {
    console.log('✅ First 5 contractors:', data.value);
  }
}

// ----- Main -----
(async () => {
  try {
    const token = await getToken();
    console.log('✅ Got token');

    const http = api(token);
    await testWhoAmI(http);
    await testAccounts(http);
    await testContractors(http);
  } catch (err) {
    const details = err.response?.data || err.message || err;
    console.error('❌ Error:', details);
    process.exit(1);
  }
})();
