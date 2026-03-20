const router = require("express").Router();
const db     = require("../config/db");
const auth   = require("../middleware/auth");

// GET feed
router.get("/feed", auth, async (req, res) => {
  try {
    const result = await db.query(
      `SELECT p.*, s.name AS shop_name, c.name AS category_name
       FROM posts p
       JOIN shops s ON p.shop_id = s.id
       JOIN categories c ON s.category_id = c.id
       WHERE s.is_active = true
       ORDER BY p.created_at DESC LIMIT 20`
    );
    res.json({ posts: result.rows });
  } catch (err) {
    res.status(500).json({ message: "Server error." });
  }
});

// POST like a post
router.post("/:id/like", auth, async (req, res) => {
  await db.query("UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1", [req.params.id]);
  res.json({ message: "Liked." });
});

// DELETE a post
router.delete("/:id", auth, async (req, res) => {
  await db.query("DELETE FROM posts WHERE id = $1 AND shop_id IN (SELECT id FROM shops WHERE owner_id = $2)", [req.params.id, req.user.userId]);
  res.json({ message: "Deleted." });
});

// POST upload new post
router.post("/", auth, async (req, res) => {
  const { type, caption } = req.body;
  const shopResult = await db.query("SELECT id FROM shops WHERE owner_id = $1", [req.user.userId]);
  if (!shopResult.rows.length) return res.status(404).json({ message: "Shop not found." });
  const shopId = shopResult.rows[0].id;
  await db.query(
    "INSERT INTO posts (shop_id, type, media_url, caption) VALUES ($1, $2, $3, $4)",
    [shopId, type, "placeholder_url", caption]
  );
  res.status(201).json({ message: "Post created." });
});

module.exports = router;