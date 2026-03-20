const router = require("express").Router();
const db     = require("../config/db");
const auth   = require("../middleware/auth");

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shops
// Query params: categorySlug, lat, lng, radius (km), minRating, sortBy, openOnly
// Public route — no login needed
// ─────────────────────────────────────────────────────────────────────────────
router.get("/", async (req, res) => {
  const {
    categorySlug,
    minRating = 0,
    sortBy    = "nearest",
  } = req.query;

  try {
    let query = `
      SELECT s.*, c.name AS category_name, c.slug AS category_slug
      FROM shops s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.is_active = true
    `;
    const params = [];
    let   paramCount = 1;

    // Filter by category
    if (categorySlug) {
      query += ` AND c.slug = $${paramCount++}`;
      params.push(categorySlug);
    }

    // Filter by minimum rating
    if (minRating > 0) {
      query += ` AND s.avg_rating >= $${paramCount++}`;
      params.push(parseFloat(minRating));
    }

    // Sort
    if (sortBy === "rating")  query += " ORDER BY s.avg_rating DESC";
    else                      query += " ORDER BY s.created_at DESC";

    const result = await db.query(query, params);
    res.json({ shops: result.rows });

  } catch (err) {
    console.error("Get shops error:", err.message);
    res.status(500).json({ message: "Server error." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shops/categories
// Returns all categories
// ─────────────────────────────────────────────────────────────────────────────
router.get("/categories", async (req, res) => {
  try {
    const result = await db.query(
      "SELECT * FROM categories ORDER BY display_order ASC"
    );
    res.json({ categories: result.rows });
  } catch (err) {
    console.error("Get categories error:", err.message);
    res.status(500).json({ message: "Server error." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/shops/:id
// Returns single shop with full details
// ─────────────────────────────────────────────────────────────────────────────
router.get("/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // Get shop
    const shopResult = await db.query(
      `SELECT s.*, c.name AS category_name
       FROM shops s
       LEFT JOIN categories c ON s.category_id = c.id
       WHERE s.id = $1`,
      [id]
    );
    if (shopResult.rows.length === 0) {
      return res.status(404).json({ message: "Shop not found." });
    }
    const shop = shopResult.rows[0];

    // Get follower count
    const followResult = await db.query(
      "SELECT COUNT(*) FROM follows WHERE shop_id = $1",
      [id]
    );
    shop.followers = parseInt(followResult.rows[0].count);

    // Get recent reviews
    const reviewResult = await db.query(
      `SELECT r.*, u.name AS user_name
       FROM reviews r
       LEFT JOIN users u ON r.consumer_id = u.id
       WHERE r.shop_id = $1
       ORDER BY r.created_at DESC
       LIMIT 10`,
      [id]
    );
    shop.reviews_list = reviewResult.rows;

    // Get posts
    const postResult = await db.query(
      "SELECT * FROM posts WHERE shop_id = $1 ORDER BY created_at DESC",
      [id]
    );
    shop.posts = postResult.rows;

    res.json({ shop });

  } catch (err) {
    console.error("Get shop error:", err.message);
    res.status(500).json({ message: "Server error." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/shops
// Create a new shop (owner only, requires auth)
// Body: { name, description, address, latitude, longitude, phone, categoryId }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", auth, async (req, res) => {
  const { name, description, address, latitude, longitude, phone, categoryId } = req.body;
  const ownerId = req.user.userId;

  try {
    // Only owners can create shops
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Only shop owners can create shops." });
    }

    if (!name || !address || !categoryId) {
      return res.status(400).json({ message: "Name, address and category are required." });
    }

    const result = await db.query(
      `INSERT INTO shops (owner_id, category_id, name, description, address, latitude, longitude, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [ownerId, categoryId, name, description, address, latitude, longitude, phone]
    );

    res.status(201).json({
      message: "Shop created. Complete payment to go live.",
      shop: result.rows[0],
    });

  } catch (err) {
    console.error("Create shop error:", err.message);
    res.status(500).json({ message: "Server error." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/shops/:id/follow
// Follow or unfollow a shop (consumer only)
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:id/follow", auth, async (req, res) => {
  const shopId     = req.params.id;
  const consumerId = req.user.userId;

  try {
    // Check if already following
    const existing = await db.query(
      "SELECT id FROM follows WHERE consumer_id = $1 AND shop_id = $2",
      [consumerId, shopId]
    );

    if (existing.rows.length > 0) {
      // Unfollow
      await db.query(
        "DELETE FROM follows WHERE consumer_id = $1 AND shop_id = $2",
        [consumerId, shopId]
      );
      return res.json({ message: "Unfollowed.", following: false });
    }

    // Follow
    await db.query(
      "INSERT INTO follows (consumer_id, shop_id) VALUES ($1, $2)",
      [consumerId, shopId]
    );
    res.json({ message: "Following.", following: true });

  } catch (err) {
    console.error("Follow error:", err.message);
    res.status(500).json({ message: "Server error." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/shops/:id/review
// Add a review to a shop
// Body: { rating, comment }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:id/review", auth, async (req, res) => {
  const shopId     = req.params.id;
  const consumerId = req.user.userId;
  const { rating, comment } = req.body;

  try {
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5." });
    }

    // Check not already reviewed
    const existing = await db.query(
      "SELECT id FROM reviews WHERE consumer_id = $1 AND shop_id = $2",
      [consumerId, shopId]
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: "You have already reviewed this shop." });
    }

    // Save review
    await db.query(
      "INSERT INTO reviews (consumer_id, shop_id, rating, comment) VALUES ($1, $2, $3, $4)",
      [consumerId, shopId, rating, comment]
    );

    // Update shop avg_rating
    await db.query(
      `UPDATE shops SET avg_rating = (
        SELECT ROUND(AVG(rating)::numeric, 1) FROM reviews WHERE shop_id = $1
      ) WHERE id = $1`,
      [shopId]
    );

    res.status(201).json({ message: "Review submitted successfully." });

  } catch (err) {
    console.error("Review error:", err.message);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;