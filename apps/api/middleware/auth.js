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
