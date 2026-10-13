// Parses req.body / req.query / req.params with zod schemas and replaces them with the parsed values.
export const validate = (schemas) => (req, res, next) => {
  try {
    for (const key of ['body', 'query', 'params']) {
      if (schemas[key]) req[key] = schemas[key].parse(req[key]);
    }
    next();
  } catch (err) {
    next(err);
  }
};
