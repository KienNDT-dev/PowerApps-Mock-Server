const { createHttp } = require("../lib/dataverseClient");

async function whoAmI() {
  const http = await createHttp();
  const { data } = await http.get("WhoAmI()");
  return data;
}

async function listAccounts({ select = "name,accountid", top = 5 } = {}) {
  const http = await createHttp();
  const url = `accounts?$select=${select}&$top=${top}`;
  const { data } = await http.get(url);
  return data;
}

module.exports = { whoAmI, listAccounts };
