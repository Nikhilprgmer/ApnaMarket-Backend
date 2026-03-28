const router = require("express").Router();
const bcrypt = require("bcryptjs");
const jwt    = require("jsonwebtoken");
const db     = require("../config/db");

// ─── Helper: generate 6 digit OTP ────────────────────────────────────────────
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─── Helper: send OTP via email (Resend.com) ──────────────────────────────────
async function sendEmailOTP(email, otp) {
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.SENDGRID_API_KEY}`,
      "Content-Type":  "application/json",
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email }] }],
      from:    { email: "otp@seonimart.online", name: "SeoniMart"  },
      subject: "Your ApnaMarket OTP",
      content: [{
        type:  "text/html",
        value: `<h2>Your OTP is: <strong>${otp}</strong></h2><p>Valid for 10 minutes.</p>`,
      }],
    }),
  });

  if (!response.ok) {
    const data = await response.json();
    console.error("SendGrid error:", data);
    throw new Error("Failed to send OTP email");
  }

  console.log("Email sent to:", email);
}

// ─── Helper: send OTP via SMS ─────────────────────────────────────────────────
async function sendSmsOTP(phone, otp) {
  const twilio = require("twilio")(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
  );
  await twilio.messages.create({
    body: `Your ApnaMarket OTP is: ${otp}. Valid for 10 minutes.`,
    from: process.env.TWILIO_PHONE,
    to:   phone,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/register
// Body: { name, email, phone, password, role, otpMethod }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/register", async (req, res) => {
  const { name, email, phone, password, role = "consumer", otpMethod = "phone" } = req.body;
  const normalizedOtpMethod = (otpMethod || "phone").toLowerCase();

  try {
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }
    if (!["email", "phone"].includes(normalizedOtpMethod)) {
      return res.status(400).json({ message: "Invalid otpMethod. Use 'email' or 'phone'." });
    }

    const exists = await db.query(
      "SELECT id FROM users WHERE email = $1 OR phone = $2",
      [email, phone]
    );
    if (exists.rows.length > 0) {
      return res.status(409).json({ message: "Email or phone already registered." });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const otp          = generateOTP();
    const otpExpires   = new Date(Date.now() + 10 * 60 * 1000);

    const result = await db.query(
      `INSERT INTO users (name, email, phone, password_hash, role, otp_code, otp_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [name, email, phone, passwordHash, role, otp, otpExpires]
    );

    const userId = result.rows[0].id;

    if (normalizedOtpMethod === "email") {
      try {
        await sendEmailOTP(email, otp);
      } catch (emailErr) {
        console.error("OTP email failed:", emailErr.message);
        await db.query("DELETE FROM users WHERE id = $1", [userId]);
        return res.status(500).json({ message: "Failed to send OTP email. Please try again." });
      }
    } else {
      try {
        await sendSmsOTP(`+91${phone}`, otp);
      } catch (smsErr) {
        console.error("OTP SMS failed:", smsErr.message);
        await db.query("DELETE FROM users WHERE id = $1", [userId]);
        return res.status(500).json({ message: "Failed to send OTP SMS. Please try again." });
      }
    }

    return res.status(201).json({
      message: "Registration successful. OTP sent. Please verify your account.",
      userId,
    });

  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ message: "Server error. Please try again." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/verify-otp
// Body: { userId, otp }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/verify-otp", async (req, res) => {
  const { userId, otp } = req.body;

  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }
    const user = result.rows[0];

    if (user.otp_code !== otp) {
      return res.status(400).json({ message: "Invalid OTP. Please try again." });
    }
    if (new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    await db.query(
      "UPDATE users SET is_verified = true, otp_code = null WHERE id = $1",
      [userId]
    );

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      message: "Account verified successfully.",
      token,
      user: { id: user.id, name: user.name, role: user.role },
    });

  } catch (err) {
    console.error("Verify OTP error:", err.message);
    res.status(500).json({ message: "Server error. Please try again." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Body: { identifier, password }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { identifier, password } = req.body;

  try {
    const result = await db.query(
      "SELECT * FROM users WHERE email = $1 OR phone = $1",
      [identifier]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No account found with this email or phone." });
    }
    const user = result.rows[0];

    if (!user.is_verified) {
      return res.status(403).json({ message: "Account not verified. Please verify your OTP first." });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Incorrect password. Please try again." });
    }

    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      message: "Login successful.",
      token,
      user: {
        id:    user.id,
        name:  user.name,
        email: user.email,
        phone: user.phone,
        role:  user.role,
      },
    });

  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ message: "Server error. Please try again." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/resend-otp
// Body: { userId, otpMethod }
// ─────────────────────────────────────────────────────────────────────────────
router.post("/resend-otp", async (req, res) => {
  const { userId, otpMethod = "phone" } = req.body;
  const normalizedOtpMethod = (otpMethod || "phone").toLowerCase();

  try {
    if (!["email", "phone"].includes(normalizedOtpMethod)) {
      return res.status(400).json({ message: "Invalid otpMethod. Use 'email' or 'phone'." });
    }

    const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }
    const user = result.rows[0];

    const otp        = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    await db.query(
      "UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE id = $3",
      [otp, otpExpires, userId]
    );

    if (normalizedOtpMethod === "email") {
      await sendEmailOTP(user.email, otp);
    } else {
      await sendSmsOTP(`+91${user.phone}`, otp);
    }

    res.json({ message: "OTP resent successfully." });

  } catch (err) {
    console.error("Resend OTP error:", err.message);
    res.status(500).json({ message: "Server error. Please try again." });
  }
});

module.exports = router;