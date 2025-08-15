const axios = require("axios");
const config = require("../config/env");
const { getToken } = require("./msalClient");

function baseHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/json;odata.metadata=none",
    "Content-Type": "application/json; charset=utf-8",
    "OData-Version": "4.0",
    "OData-MaxVersion": "4.0",
  };
}

async function createHttp() {
  const token = await getToken();
  const instance = axios.create({
    baseURL: `${config.dataverseUrl}/api/data/${config.apiVersion}/`,
    headers: baseHeaders(token),
    validateStatus: (s) => s < 500,
  });

  // Optional: refresh token on 401 once
  instance.interceptors.response.use(undefined, async (error) => {
    const original = error.config;
    if (
      error.response &&
      error.response.status === 401 &&
      !original.__retried
    ) {
      original.__retried = true;
      const newToken = await getToken();
      original.headers = {
        ...original.headers,
        Authorization: `Bearer ${newToken}`,
      };
      return instance.request(original);
    }
    return Promise.reject(error);
  });

  return instance;
}

module.exports = { createHttp };
