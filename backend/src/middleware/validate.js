const { z } = require('zod');

const validate = (schema) => (req, res, next) => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        path: err.path,
        message: err.message
      }));
      return res.status(400).json({ message: 'Invalid input', errors: fieldErrors });
    }
    next(error);
  }
};

const validateQuery = (schema) => (req, res, next) => {
  try {
    req.query = schema.parse(req.query);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const fieldErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        path: err.path,
        message: err.message
      }));
      return res.status(400).json({ message: 'Invalid input', errors: fieldErrors });
    }
    next(error);
  }
};

module.exports = validate;
module.exports.validate = validate;
module.exports.validateQuery = validateQuery;
