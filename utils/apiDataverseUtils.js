const { toAppErrorFromAxios } = require("../constants/mapDataverseError");
const { createHttp } = require("../lib/dataverseClient");

async function safeGet(url, options = {}) {
  try {
    const http = await createHttp();
    return await http.get(url, options);
  } catch (err) {
    throw toAppErrorFromAxios(err);
  }
}

async function safePost(url, data, options = {}) {
  try {
    const http = await createHttp();
    console.log("http post:", http.post);
    return await http.post(url, data, options);
  } catch (err) {
    throw toAppErrorFromAxios(err);
  }
}

async function safePatch(url, data, options = {}) {
  try {
    const http = await createHttp();
    return await http.patch(url, data, options);
  } catch (err) {
    throw toAppErrorFromAxios(err);
  }
}

async function safeDelete(url, options = {}) {
  try {
    const http = await createHttp();
    return await http.delete(url, options);
  } catch (err) {
    throw toAppErrorFromAxios(err);
  }
}

module.exports = {
  safeGet,
  safePost,
  safePatch,
  safeDelete,
};
