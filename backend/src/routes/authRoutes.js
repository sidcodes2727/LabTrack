import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { supabase } from '../services/supabase.js';

const router = express.Router();
const isAllowedLoginEmail = (email) => {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const atIndex = normalizedEmail.lastIndexOf('@');

  if (atIndex === -1) {
    return false;
  }

  const domain = normalizedEmail.slice(atIndex + 1);
  return domain === 'vjti.ac.in' || domain.endsWith('.vjti.ac.in');
};

router.post('/signup', async (req, res, next) => {
  try {
    const { name, email, password, role } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'All fields are required' });
    }

    if (!isAllowedLoginEmail(normalizedEmail)) {
      return res.status(403).json({ message: 'Only emails ending with vjti.ac.in can signup.' });
    }

    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ message: 'Email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const { data, error } = await supabase
      .from('users')
      .insert({ name, email: normalizedEmail, password_hash: passwordHash, role })
      .select('id, name, email, role')
      .single();

    if (error) throw error;

    return res.status(201).json(data);
  } catch (error) {
    return next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password, role } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!isAllowedLoginEmail(normalizedEmail)) {
      return res.status(403).json({ message: 'Only emails ending with vjti.ac.in can login.' });
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (error) throw error;
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const isValid = await bcrypt.compare(password, user.password_hash);
    if (!isValid) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (role && user.role !== role) {
      return res.status(403).json({ message: `This account is ${user.role}. Switch role tab to continue.` });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: '1d' }
    );

    return res.json({
      token,
      user: { id: user.id, name: user.name, email: user.email, role: user.role }
    });
  } catch (error) {
    return next(error);
  }
});

export default router;
