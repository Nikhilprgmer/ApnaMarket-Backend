const jwt = require("jsonwebtoken");

// ─────────────────────────────────────────────────────────────────────────────
// This middleware runs BEFORE any protected route.
// It checks if the request has a valid JWT token.
// If valid  → allows the request through and adds user info to req.user
// If invalid → blocks the request with 401 Unauthorized
// ─────────────────────────────────────────────────────────────────────────────
module.exports = function auth(req, res, next) {
  // Token comes in the header like:
  // Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
  const authHeader = req.headers["authorization"];
  const token      = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ message: "Access denied. Please login first." });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // { userId, role }
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token. Please login again." });
  }
};
