// Railway internal MongoDB - no DNS tricks needed

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const { webcrypto } = require('crypto');
require('dotenv').config();

if (!globalThis.crypto) {
  globalThis.crypto = webcrypto;
}

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'antigravity_secret_key_12345';

// Middleware
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map(origin => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    if (/^https:\/\/.+\.vercel\.app$/.test(origin)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));
app.use(express.json());

// MongoDB Connection
const mongoURI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/auth_demo';

const connectWithRetry = () => {
  mongoose.connect(mongoURI, {
    serverSelectionTimeoutMS: 30000,
    socketTimeoutMS: 45000,
    connectTimeoutMS: 30000,
    maxPoolSize: 10,
    family: 4, // Force IPv4
  })
    .then(() => console.log('✅ MongoDB Connected Successfully!'))
    .catch(err => {
      console.error('❌ MongoDB Connection Error:', err.message);
      console.log('🔄 Retrying connection in 5 seconds...');
      setTimeout(connectWithRetry, 5000);
    });
};

connectWithRetry();

// User Schema
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, sparse: true },
  phone: { type: String, unique: true, sparse: true },
  password: { type: String, required: true },
  otp: { type: String },
  otpExpiry: { type: Date }
});

const User = mongoose.model('User', userSchema);

// Helper function to find user by email or phone
async function findUserByEmailOrPhone(identifier) {
  if (!identifier) return null;
  const isEmail = identifier.includes('@');
  if (isEmail) {
    return await User.findOne({ email: identifier.trim().toLowerCase() });
  } else {
    // Basic phone normalization (remove whitespace, dashes, etc.)
    const cleanPhone = identifier.replace(/[\s-()]/g, '');
    return await User.findOne({ phone: cleanPhone });
  }
}

// Nodemailer transporter config (Optional, if SMTP env variables are provided)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || '',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
});

async function sendSmsOtp(phone, otp) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_PHONE;

  if (!sid || !token || !from || !phone) {
    return false;
  }

  const body = new URLSearchParams({
    To: phone,
    From: from,
    Body: `Your Secure Auth OTP is ${otp}. It expires in 5 minutes.`
  });

  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Twilio SMS failed: ${errorText}`);
  }

  return true;
}

// Authentication Middleware
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Unauthorized. No token provided.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token.' });
  }
};

// --- ROUTES ---

// Health check endpoint
app.get('/', (req, res) => {
  res.json({ success: true, message: 'Secure Auth API is running.' });
});

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    status: 'online',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'connecting'
  });
});

// 1. Signup Route
app.post('/api/signup', async (req, res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !password) {
      return res.status(400).json({ success: false, message: 'Name and Password are required.' });
    }

    if (!email && !phone) {
      return res.status(400).json({ success: false, message: 'Either Email or Phone number is required.' });
    }

    // Format & check existence
    const userFields = { name };
    
    if (email) {
      const formattedEmail = email.trim().toLowerCase();
      const existingEmail = await User.findOne({ email: formattedEmail });
      if (existingEmail) {
        return res.status(400).json({ success: false, message: 'Email is already registered.' });
      }
      userFields.email = formattedEmail;
    }

    if (phone) {
      const cleanPhone = phone.replace(/[\s-()]/g, '');
      const existingPhone = await User.findOne({ phone: cleanPhone });
      if (existingPhone) {
        return res.status(400).json({ success: false, message: 'Phone number is already registered.' });
      }
      userFields.phone = cleanPhone;
    }

    // Hash password
    userFields.password = await bcrypt.hash(password, 10);

    // Create User
    const newUser = new User(userFields);
    await newUser.save();

    // Create JWT Token
    const token = jwt.sign({ id: newUser._id }, JWT_SECRET, { expiresIn: '7d' });

    res.status(201).json({
      success: true,
      message: 'Account created successfully!',
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        phone: newUser.phone
      }
    });

  } catch (error) {
    console.error('Signup Error:', error);
    res.status(500).json({ success: false, message: 'Server error during signup.' });
  }
});

// 2. Password Login Route
app.post('/api/login', async (req, res) => {
  try {
    const { emailOrPhone, password } = req.body;

    if (!emailOrPhone || !password) {
      return res.status(400).json({ success: false, message: 'Email/Phone and Password are required.' });
    }

    const user = await findUserByEmailOrPhone(emailOrPhone);
    if (!user) {
      return res.status(400).json({ success: false, message: 'Invalid credentials. User not found.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Invalid credentials. Incorrect password.' });
    }

    // Create JWT Token
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'Logged in successfully!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });

  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ success: false, message: 'Server error during login.' });
  }
});

// 3. Send OTP Route
app.post('/api/otp/send', async (req, res) => {
  try {
    const { emailOrPhone } = req.body;

    if (!emailOrPhone) {
      return res.status(400).json({ success: false, message: 'Email or Phone is required.' });
    }

    const user = await findUserByEmailOrPhone(emailOrPhone);
    if (!user) {
      return res.status(404).json({ success: false, message: 'No registered account found with this email/phone.' });
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.otp = otp;
    user.otpExpiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes validity
    await user.save();

    console.log(`[Demo OTP Log] OTP for ${emailOrPhone} is: ${otp}`);

    let emailSent = false;
    let smsSent = false;
    // Attempt real email send if configured
    if (user.email && process.env.SMTP_HOST && process.env.SMTP_USER) {
      try {
        await transporter.sendMail({
          from: `"Secure Auth" <${process.env.SMTP_USER}>`,
          to: user.email,
          subject: 'Your One-Time Password (OTP)',
          text: `Hello ${user.name},\n\nYour OTP for logging in is: ${otp}. It will expire in 5 minutes.\n\nSecure Auth`,
          html: `<p>Hello <strong>${user.name}</strong>,</p><p>Your OTP for logging in is: <strong style="font-size: 18px; color: #6366f1; letter-spacing: 2px;">${otp}</strong>.</p><p>It will expire in 5 minutes.</p>`
        });
        emailSent = true;
      } catch (err) {
        console.error('Nodemailer Error:', err.message);
      }
    }

    if (user.phone) {
      try {
        smsSent = await sendSmsOtp(user.phone, otp);
      } catch (err) {
        console.error('SMS OTP Error:', err.message);
      }
    }

    const delivered = emailSent || smsSent;

    res.json({
      success: true,
      message: delivered ? 'OTP sent successfully.' : 'OTP generated successfully (Demo Mode).',
      demoOtp: otp, // Returned for easy copying on frontend testing
      emailSent,
      smsSent
    });

  } catch (error) {
    console.error('Send OTP Error:', error);
    res.status(500).json({ success: false, message: 'Server error generating OTP.' });
  }
});

// 4. Verify OTP Route
app.post('/api/otp/verify', async (req, res) => {
  try {
    const { emailOrPhone, otp } = req.body;

    if (!emailOrPhone || !otp) {
      return res.status(400).json({ success: false, message: 'Email/Phone and OTP code are required.' });
    }

    const user = await findUserByEmailOrPhone(emailOrPhone);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Check if OTP matches and is not expired
    if (!user.otp || user.otp !== otp.trim()) {
      return res.status(400).json({ success: false, message: 'Invalid OTP code.' });
    }

    if (new Date() > user.otpExpiry) {
      return res.status(400).json({ success: false, message: 'OTP has expired. Please request a new one.' });
    }

    // Clear OTP details upon success
    user.otp = undefined;
    user.otpExpiry = undefined;
    await user.save();

    // Create JWT Token
    const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });

    res.json({
      success: true,
      message: 'OTP verified successfully!',
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone
      }
    });

  } catch (error) {
    console.error('Verify OTP Error:', error);
    res.status(500).json({ success: false, message: 'Server error verifying OTP.' });
  }
});

// 5. Get Logged In User profile (Protected)
app.get('/api/me', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password -otp -otpExpiry');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User profile not found.' });
    }
    res.json({ success: true, user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ success: false, message: 'Server error retrieving profile.' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
