const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { z } = require('zod');
const User = require('../models/User');
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

const prefsSchema = z.object({
  phone: z.string().optional(),
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

    const newUser = await User.create({ name, email, passwordHash, role, phone });
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
    
    if (phone !== undefined) user.phone = phone;
    if (notificationPrefs) {
      if (notificationPrefs.email !== undefined) user.notificationPrefs.email = notificationPrefs.email;
      if (notificationPrefs.whatsapp !== undefined) user.notificationPrefs.whatsapp = notificationPrefs.whatsapp;
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
