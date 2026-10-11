const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../models/User');
const walletService = require('../services/walletService');
const env = require('../config/env');

const signupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["brand", "creator"], { errorMap: () => ({ message: "Role must be 'brand' or 'creator'" }) }),
  phone: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email("Invalid email"),
  password: z.string().min(1, "Password is required")
});

// Indian mobile number regex:
// Accepts 10 digits starting with 6-9, or +91 followed by 10 digits starting with 6-9, or empty string to remove.
const phoneRegex = /^(\+91)?[6-9]\d{9}$/;

const prefsSchema = z.object({
  phone: z.string().refine((val) => {
    if (val === '' || val === null || val === undefined) return true;
    return phoneRegex.test(val.trim());
  }, { message: "Invalid Indian mobile number. Must be 10 digits starting with 6-9 or prefixed with +91" }).optional(),
  notificationPrefs: z.object({
    email: z.boolean().optional(),
    whatsapp: z.boolean().optional()
  }).optional()
});

const generateToken = (user) => {
  return jwt.sign({ id: user._id, role: user.role }, env.JWT_SECRET, { expiresIn: '7d' });
};

const signup = async (req, res, next) => {
  try {
    const { name, email, password, role, phone } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    let normalizedPhone = phone;
    if (phone && phone.trim()) {
      const clean = phone.trim();
      normalizedPhone = clean.startsWith('+91') ? clean : `+91${clean}`;
    }

    const newUser = await User.create({ name, email, passwordHash, role, phone: normalizedPhone });
    
    // Create wallet for creators at signup (brands get no wallet)
    if (newUser.role === 'creator') {
      await walletService.ensureWallet(newUser._id);
    }

    const token = generateToken(newUser);
    
    const userObj = newUser.toObject();
    delete userObj.passwordHash;

    res.status(201).json({ token, user: userObj });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const token = generateToken(user);
    const userObj = user.toObject();
    delete userObj.passwordHash;

    res.status(200).json({ token, user: userObj });
  } catch (error) {
    next(error);
  }
};

const getMe = async (req, res, next) => {
  try {
    res.status(200).json({ user: req.user });
  } catch (error) {
    next(error);
  }
};

const updatePreferences = async (req, res, next) => {
  try {
    const { phone, notificationPrefs } = req.body;
    const user = req.user;
    
    if (phone !== undefined) {
      if (phone === '' || phone === null) {
        user.phone = undefined;
      } else {
        const clean = phone.trim();
        user.phone = clean.startsWith('+91') ? clean : `+91${clean}`;
      }
    }

    if (notificationPrefs) {
      if (notificationPrefs.email !== undefined) user.notificationPrefs.email = Boolean(notificationPrefs.email);
      if (notificationPrefs.whatsapp !== undefined) user.notificationPrefs.whatsapp = Boolean(notificationPrefs.whatsapp);
    }
    
    await user.save();
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  signupSchema,
  loginSchema,
  prefsSchema,
  signup,
  login,
  getMe,
  updatePreferences
};
