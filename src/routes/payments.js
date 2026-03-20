const router   = require("express").Router();
const Razorpay = require("razorpay");
const crypto   = require("crypto");
const db       = require("../config/db");
const auth     = require("../middleware/auth");

// ─── Razorpay instance ────────────────────────────────────────────────────────
const razorpay = new Razorpay({
  key_id:     process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/create-order
// Creates a Razorpay order for ₹100 shop listing fee
// Protected — owner must be logged in
// ─────────────────────────────────────────────────────────────────────────────
router.post("/create-order", auth, async (req, res) => {
  const { shopId } = req.body;
  const userId     = req.user.userId;

  try {
    // Only owners can pay
    if (req.user.role !== "owner") {
      return res.status(403).json({ message: "Only shop owners can make this payment." });
    }

    // Verify shop belongs to this owner
    const shopResult = await db.query(
      "SELECT * FROM shops WHERE id = $1 AND owner_id = $2",
      [shopId, userId]
    );
    if (shopResult.rows.length === 0) {
      return res.status(404).json({ message: "Shop not found." });
    }

    // Check not already paid
    const existingPayment = await db.query(
      "SELECT * FROM payments WHERE shop_id = $1 AND status = $2",
      [shopId, "success"]
    );
    if (existingPayment.rows.length > 0) {
      return res.status(409).json({ message: "This shop is already activated." });
    }

    // Create Razorpay order — amount is in paise (₹100 = 10000 paise)
    const order = await razorpay.orders.create({
      amount:   10000,
      currency: "INR",
      receipt:  `receipt_${shopId}_${Date.now()}`,
      notes: {
        shopId,
        userId,
      },
    });

    // Save pending payment record in database
    await db.query(
      `INSERT INTO payments (shop_id, user_id, razorpay_order_id, amount, status)
       VALUES ($1, $2, $3, $4, $5)`,
      [shopId, userId, order.id, 100, "pending"]
    );

    res.json({
      message:   "Order created.",
      orderId:   order.id,
      amount:    order.amount,
      currency:  order.currency,
      keyId:     process.env.RAZORPAY_KEY_ID,
    });

  } catch (err) {
    console.error("Create order error:", err.message);
    res.status(500).json({ message: "Payment order creation failed." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/payments/verify
// Verifies payment signature from Razorpay after successful payment
// Body: { razorpay_order_id, razorpay_payment_id, razorpay_signature, shopId }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/verify", auth, async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    shopId,
  } = req.body;

  try {
    // ── Step 1: Verify signature ───────────────────────────────────────────
    // Razorpay sends a signature — we recreate it and compare
    // If they match → payment is genuine
    // If they don't match → payment is fake/tampered
    const body      = razorpay_order_id + "|" + razorpay_payment_id;
    const expected  = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expected !== razorpay_signature) {
      return res.status(400).json({ message: "Payment verification failed. Invalid signature." });
    }

    // ── Step 2: Update payment record ──────────────────────────────────────
    await db.query(
      `UPDATE payments
       SET status = 'success',
           razorpay_payment_id = $1,
           paid_at = NOW()
       WHERE razorpay_order_id = $2`,
      [razorpay_payment_id, razorpay_order_id]
    );

    // ── Step 3: Activate the shop ──────────────────────────────────────────
    await db.query(
      "UPDATE shops SET is_active = true WHERE id = $1",
      [shopId]
    );

    res.json({
      message: "Payment verified. Your shop is now live on ApnaMarket!",
      shopId,
    });

  } catch (err) {
    console.error("Verify payment error:", err.message);
    res.status(500).json({ message: "Payment verification failed." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/payments/status/:shopId
// Check payment status for a shop
// ─────────────────────────────────────────────────────────────────────────────
router.get("/status/:shopId", auth, async (req, res) => {
  const { shopId } = req.params;

  try {
    const result = await db.query(
      "SELECT * FROM payments WHERE shop_id = $1 ORDER BY paid_at DESC LIMIT 1",
      [shopId]
    );

    if (result.rows.length === 0) {
      return res.json({ status: "not_paid", message: "No payment found for this shop." });
    }

    res.json({
      status:    result.rows[0].status,
      paidAt:    result.rows[0].paid_at,
      amount:    result.rows[0].amount,
    });

  } catch (err) {
    console.error("Payment status error:", err.message);
    res.status(500).json({ message: "Server error." });
  }
});

module.exports = router;