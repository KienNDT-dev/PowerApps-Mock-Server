const { createHttp } = require("../lib/dataverseClient");
const { buildOData } = require("../lib/odata");

const ENTITY_SET = "cr97b_contractors"; // entity set (plural)
const PK_LOGICAL = "cr97b_contractorid"; // Row ID (GUID)

const GUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const isGuid = (v = "") => GUID_RE.test(String(v).replace(/[{}]/g, ""));
const sanitizeSelect = (s) =>
  s && String(s).trim()
    ? String(s).trim()
    : `${PK_LOGICAL},cr97b_contractorid,cr97b_contractorname,cr97b_address,cr97b_phonenumber,cr97b_email,cr97b_representativename,cr97b_representativetitle,cr97b_registeredon`;

async function listContractors({ select, top = 5, filter, orderby } = {}) {
  const http = await createHttp();
  const qs = buildOData({
    select: sanitizeSelect(select),
    top: Number.isFinite(+top) ? +top : 5,
    filter,
    orderby,
  });
  const { data } = await http.get(`${ENTITY_SET}?${qs}`);
  return data;
}

async function getContractor(guid, { select } = {}) {
  if (!isGuid(guid)) {
    const e = new Error("Invalid id: must be a GUID");
    e.status = 400;
    e.code = "INVALID_ID";
    throw e;
  }
  const http = await createHttp();
  const clean = String(guid).replace(/[{}]/g, "");
  const sel = sanitizeSelect(select);
  const { data } = await http.get(`${ENTITY_SET}(${clean})?$select=${sel}`);
  return data;
}

module.exports = { listContractors, getContractor };
