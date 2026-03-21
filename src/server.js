const express    = require("express");
const cors       = require("cors");
require("dotenv").config();

const db = require("./config/db");

const authRoutes    = require("./routes/auth");
const shopRoutes    = require("./routes/shops");
const postRoutes    = require("./routes/posts");
const paymentRoutes = require("./routes/payments");
const ownerRoutes   = require("./routes/owner");
const userRoutes    = require("./routes/users");

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({
  origin:         "*",
  methods:        ["GET", "POST", "PUT", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));
app.use(express.json());

app.use("/api/auth",     authRoutes);
app.use("/api/shops",    shopRoutes);
app.use("/api/posts",    postRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/owner",    ownerRoutes);
app.use("/api/users",    userRoutes);

app.get("/", (req, res) => {
  res.json({ message: "ApnaMarket API is running!" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});