const PORT = process.env.PORT || 5000;
const ownerRoutes = require("./routes/owner");
const express    = require("express");
const cors       = require("cors");
require("dotenv").config();

const db = require("./config/db");

const authRoutes    = require("./routes/auth");
const shopRoutes    = require("./routes/shops");
const postRoutes    = require("./routes/posts");
const paymentRoutes = require("./routes/payments");
const userRoutes  = require("./routes/users");  // ← add this
app.use("/api/users", userRoutes);               // ← add this
const app  = express();

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use("/api/owner", ownerRoutes);
// ── Routes ──────────────────────────────────────────────────────────────────
app.use("/api/auth",     authRoutes);
app.use("/api/shops",    shopRoutes);
app.use("/api/posts",    postRoutes);
app.use("/api/payments", paymentRoutes);

// ── Health check ────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ message: "ApnaMarket API is running!" });
});

// ── Start server ────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});