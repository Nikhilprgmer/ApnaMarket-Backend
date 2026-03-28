const router     = require("express").Router();
const db         = require("../config/db");
const auth       = require("../middleware/auth");
const cloudinary = require("cloudinary").v2;
const multer     = require("multer");

// ─── Cloudinary config ────────────────────────────────────────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Multer memory storage ────────────────────────────────────────────────────
const storage = multer.memoryStorage();
const upload  = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB max
});

// ─── Helper: upload to Cloudinary ─────────────────────────────────────────────
function uploadToCloudinary(buffer, options) {
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else resolve(result);
    }).end(buffer);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/posts/feed
// ─────────────────────────────────────────────────────────────────────────────
router.get("/feed", auth, async (req, res) => {
  const userId = req.user.userId;
  try {
    const result = await db.query(
      `SELECT p.*, s.name AS shop_name, s.cover_image AS shop_avatar
       FROM posts p
       JOIN shops s ON p.shop_id = s.id
       WHERE s.id IN (
         SELECT shop_id FROM follows WHERE consumer_id = $1
       )
       ORDER BY p.created_at DESC
       LIMIT 50`,
      [userId]
    );
    res.json({ posts: result.rows });
  } catch (err) {
    console.error("Feed error:", err.message);
    res.status(500).json({ message: "Server error." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/posts
// Upload reel or photo
// ─────────────────────────────────────────────────────────────────────────────
router.post("/", auth, upload.single("media"), async (req, res) => {
  const ownerId = req.user.userId;
  const { caption, type } = req.body;

  try {
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Only shop owners can post." });
    }

    // Get owner's shop
    const shopResult = await db.query(
      "SELECT id FROM shops WHERE owner_id = $1 AND is_active = true",
      [ownerId]
    );
    if (shopResult.rows.length === 0) {
      return res.status(404).json({ message: "No active shop found." });
    }
    const shopId = shopResult.rows[0].id;

    if (!req.file) {
      return res.status(400).json({ message: "No media file uploaded." });
    }

    // Upload to Cloudinary
    const isVideo    = type === "reel" || req.file.mimetype.startsWith("video");
    const resourceType = isVideo ? "video" : "image";

    const uploadResult = await uploadToCloudinary(req.file.buffer, {
      folder:        `seonimart/posts/${shopId}`,
      resource_type: resourceType,
      transformation: isVideo
        ? [{ width: 720, crop: "limit" }]
        : [{ width: 1080, crop: "limit", quality: "auto" }],
    });

    // Save to database
    const result = await db.query(
      `INSERT INTO posts (shop_id, type, media_url, thumbnail_url, caption)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [
        shopId,
        isVideo ? "reel" : "photo",
        uploadResult.secure_url,
        uploadResult.secure_url,
        caption || "",
      ]
    );

    res.status(201).json({
      message: "Post uploaded successfully!",
      post:    result.rows[0],
    });

  } catch (err) {
    console.error("Upload error:", err.message);
    res.status(500).json({ message: "Server error." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/posts/:id/like
// ─────────────────────────────────────────────────────────────────────────────
router.post("/:id/like", auth, async (req, res) => {
  const postId = req.params.id;
  try {
    await db.query(
      "UPDATE posts SET likes_count = likes_count + 1 WHERE id = $1",
      [postId]
    );
    res.json({ message: "Liked!" });
  } catch (err) {
    console.error("Like error:", err.message);
    res.status(500).json({ message: "Server error." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /api/posts/:id
// ─────────────────────────────────────────────────────────────────────────────
router.delete("/:id", auth, async (req, res) => {
  const postId  = req.params.id;
  const ownerId = req.user.userId;
  try {
    const result = await db.query(
      `DELETE FROM posts WHERE id = $1
       AND shop_id IN (SELECT id FROM shops WHERE owner_id = $2)
       RETURNING *`,
      [postId, ownerId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Post not found." });
    }
    res.json({ message: "Post deleted." });
  } catch (err) {
    console.error("Delete error:", err.message);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;