// Zod validation middleware. Rejects invalid input with 400 and the stable
// error shape before a controller runs. Valid requests pass through
// untouched (unknown body fields are stripped by Zod's default behaviour).
export const validateBody = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body ?? {});
  if (!result.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request body",
        details: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
    });
  }
  req.body = result.data;
  return next();
};

export const validateParams = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.params ?? {});
  if (!result.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid URL parameters",
        details: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
    });
  }
  req.params = result.data;
  return next();
};

// Phase 3b: validate req.query the same way. The parsed values land on
// req.pagination (NOT req.query — Express 5 exposes req.query through a
// getter, so assigning to it is not reliable). Unknown query params are
// stripped; ?page&limit are coerced and capped by paginationQuerySchema.
export const validateQuery = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.query ?? {});
  if (!result.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid query parameters",
        details: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
    });
  }
  req.pagination = result.data;
  return next();
};
