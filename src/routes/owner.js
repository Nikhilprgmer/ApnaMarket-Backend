const router = require("express").Router();
const db     = require("../config/db");
const auth   = require("../middleware/auth");

router.get("/dashboard", auth, async (req, res) => {
  try {
    const shopRes = await db.query(
      `SELECT s.*, c.name AS category_name,
       (SELECT COUNT(*) FROM follows WHERE shop_id = s.id) AS followers
       FROM shops s
       JOIN categories c ON s.category_id = c.id
       WHERE s.owner_id = $1`,
      [req.user.userId]
    );
    if (!shopRes.rows.length) return res.status(404).json({ message: "No shop found." });
    const shop = shopRes.rows[0];

    const postsRes   = await db.query("SELECT * FROM posts WHERE shop_id = $1 ORDER BY created_at DESC", [shop.id]);
    const reviewsRes = await db.query(
      `SELECT r.*, u.name AS user_name FROM reviews r
       JOIN users u ON r.consumer_id = u.id
       WHERE r.shop_id = $1 ORDER BY r.created_at DESC`,
      [shop.id]
    );

    res.json({
      shop,
      posts:   postsRes.rows,
      reviews: reviewsRes.rows,
      stats: {
        totalViews: 0,
        followers:  parseInt(shop.followers),
        totalLikes: postsRes.rows.reduce((a, p) => a + p.likes_count, 0),
      },
    });
  } catch (err) {
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;