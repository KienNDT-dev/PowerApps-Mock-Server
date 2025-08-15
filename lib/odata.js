function buildOData({ select, filter, orderby, top, expand, count } = {}) {
  const p = new URLSearchParams();
  if (select)
    p.set("$select", Array.isArray(select) ? select.join(",") : select);
  if (filter) p.set("$filter", filter);
  if (orderby) p.set("$orderby", orderby);
  if (top) p.set("$top", String(top));
  if (expand) p.set("$expand", expand);
  if (count) p.set("$count", "true");
  return p.toString();
}

module.exports = { buildOData };
