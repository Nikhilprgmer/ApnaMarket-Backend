const router     = require("express").Router();
const bcrypt     = require("bcryptjs");
const jwt        = require("jsonwebtoken");
const db         = require("../config/db");

// ─── Helper: generate 6 digit OTP ────────────────────────────────────────────
function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// ─── Helper: send OTP via email ───────────────────────────────────────────────
async function sendEmailOTP(email, otp) {
  const nodemailer = require("nodemailer");
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  await transporter.sendMail({
    from:    `"ApnaMarket" <${process.env.EMAIL_USER}>`,
    to:      email,
    subject: "Your ApnaMarket OTP",
    html:    `<h2>Your OTP is: <strong>${otp}</strong></h2><p>Valid for 10 minutes.</p>`,
  });
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

  try {
    // 1. Check all fields present
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ message: "All fields are required." });
    }

    // 2. Check if user already exists
    const exists = await db.query(
      "SELECT id FROM users WHERE email = $1 OR phone = $2",
      [email, phone]
    );
    if (exists.rows.length > 0) {
      return res.status(409).json({ message: "Email or phone already registered." });
    }

    // 3. Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // 4. Generate OTP
    const otp        = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // 5. Save user to database
    const result = await db.query(
      `INSERT INTO users (name, email, phone, password_hash, role, otp_code, otp_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [name, email, phone, passwordHash, role, otp, otpExpires]
    );

    // 6. Send OTP
    // 6. Reply instantly — don't wait for email
res.status(201).json({
  message: "Registration successful. OTP sent.",
  userId:  result.rows[0].id,
});

// Send OTP after response (non-blocking)
try {
  if (otpMethod === "email") {
    await sendEmailOTP(email, otp);
  } else {
    await sendSmsOTP(`+91${phone}`, otp);
  }
  console.log("OTP sent successfully to:", otpMethod === "email" ? email : phone);
} catch (otpErr) {
  console.error("OTP send failed:", otpErr.message);
}

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
    // 1. Find user
    const result = await db.query(
      "SELECT * FROM users WHERE id = $1",
      [userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }
    const user = result.rows[0];

    // 2. Check OTP matches
    if (user.otp_code !== otp) {
      return res.status(400).json({ message: "Invalid OTP. Please try again." });
    }

    // 3. Check OTP not expired
    if (new Date() > new Date(user.otp_expires_at)) {
      return res.status(400).json({ message: "OTP has expired. Please request a new one." });
    }

    // 4. Mark user as verified
    await db.query(
      "UPDATE users SET is_verified = true, otp_code = null WHERE id = $1",
      [userId]
    );

    // 5. Generate JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      message: "Account verified successfully.",
      token,
      user: {
        id:   user.id,
        name: user.name,
        role: user.role,
      },
    });

  } catch (err) {
    console.error("Verify OTP error:", err.message);
    res.status(500).json({ message: "Server error. Please try again." });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Body: { identifier, password }
// identifier = email or phone
// ─────────────────────────────────────────────────────────────────────────────
router.post("/login", async (req, res) => {
  const { identifier, password } = req.body;

  try {
    // 1. Find user by email or phone
    const result = await db.query(
      "SELECT * FROM users WHERE email = $1 OR phone = $1",
      [identifier]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "No account found with this email or phone." });
    }
    const user = result.rows[0];

    // 2. Check account is verified
    if (!user.is_verified) {
      return res.status(403).json({ message: "Account not verified. Please verify your OTP first." });
    }

    // 3. Check password
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Incorrect password. Please try again." });
    }

    // 4. Generate JWT token
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      message: "Login successful.",
      token,
      user: {
        id:   user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
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

  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found." });
    }
    const user = result.rows[0];

    // Generate new OTP
    const otp        = generateOTP();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000);

    await db.query(
      "UPDATE users SET otp_code = $1, otp_expires_at = $2 WHERE id = $3",
      [otp, otpExpires, userId]
    );

    if (otpMethod === "email") {
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