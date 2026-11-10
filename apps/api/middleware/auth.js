import jwt from "jsonwebtoken";

// Phase 1 fix: missing/invalid tokens now return 401 (was 400 with a plain
// string body). Phase 3a: JWT_SECRET spelling (was JWT_SECERT).
const auth = (req, res, next) => {
  try {
    const header = req.headers.authorization;
    if (!header) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Missing authorization token" },
      });
    }
    const token = header.split(" ")[1];
    if (!token) {
      return res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Missing authorization token" },
      });
    }
    const decodedata = jwt.verify(token, process.env.JWT_SECRET);
    req.userid = decodedata?.id;
    next();
  } catch (error) {
    return res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Invalid or expired token" },
    });
  }
};

export default auth;

// Phase 5: optional auth for public reads that change shape for the
// owner (GET /video/:id, GET /comment/get, GET /studio/playlists/:id).
// A valid Bearer token sets req.userid; a missing or invalid token
// leaves the request anonymous instead of 401ing — the route itself
// decides what an anonymous caller may see (private -> 404).
export const optionalAuth = (req, res, next) => {
  try {
    const header = req.headers.authorization;
    const token = header?.split(" ")[1];
    if (!token) return next();
    const decodedata = jwt.verify(token, process.env.JWT_SECRET);
    req.userid = decodedata?.id;
    return next();
  } catch {
    return next();
  }
};
