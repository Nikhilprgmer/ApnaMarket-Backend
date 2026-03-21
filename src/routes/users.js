const router = require("express").Router();
const db     = require("../config/db");
const auth   = require("../middleware/auth");

// GET /api/users/me
router.get("/me", auth, async (req, res) => {
  try {
    const userId = req.user.userId;

    // Get user details
    const userRes = await db.query(
      "SELECT id, name, email, phone, role, created_at FROM users WHERE id = $1",
      [userId]
    );
    if (!userRes.rows.length) {
      return res.status(404).json({ message: "User not found." });
    }
    const user = userRes.rows[0];

    // Get followed shops
    const followedRes = await db.query(
      `SELECT s.*, c.name AS category_name
       FROM follows f
       JOIN shops s ON f.shop_id = s.id
       JOIN categories c ON s.category_id = c.id
       WHERE f.consumer_id = $1`,
      [userId]
    );

    // Get reviews written by user
    const reviewsRes = await db.query(
      `SELECT r.*, s.name AS shop_name
       FROM reviews r
       JOIN shops s ON r.shop_id = s.id
       WHERE r.consumer_id = $1
       ORDER BY r.created_at DESC`,
      [userId]
    );

    res.json({
      user,
      followed: followedRes.rows,
      saved:    [],
      reviews:  reviewsRes.rows,
    });

  } catch (err) {
    console.error("Get profile error:", err.message);
    res.status(500).json({ message: "Server error." });
  }
});

// PUT /api/users/me
router.put("/me", auth, async (req, res) => {
  try {
    const { name, phone, location } = req.body;
    const userId = req.user.userId;

    await db.query(
      "UPDATE users SET name = $1, phone = $2 WHERE id = $3",
      [name, phone, userId]
    );

    res.json({ message: "Profile updated." });
  } catch (err) {
    console.error("Update profile error:", err.message);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;