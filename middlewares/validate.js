// Hook in zod/celebrate here later
function validate(_schema) {
  return (req, _res, next) => {
    // schema.parse({ params: req.params, query: req.query, body: req.body })
    next();
  };
}
module.exports = validate;
