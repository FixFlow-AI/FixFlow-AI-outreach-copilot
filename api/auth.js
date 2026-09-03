import bcrypt from 'bcryptjs';
import { getDb } from './lib/db.js';
import { signToken, authMiddleware } from './lib/auth.js';

export default async function handler(req, res) {
  // Enable CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const db = await getDb();
  const usersCol = db.collection('users');

  // GET /api/auth -> Verify current token session
  if (req.method === 'GET') {
    const user = authMiddleware(req, res);
    if (!user) return; // 401 response already handled

    return res.status(200).json({
      authenticated: true,
      user: {
        username: user.username,
        displayName: user.displayName,
        role: user.role
      }
    });
  }

  // POST /api/auth -> Login
  if (req.method === 'POST') {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const user = await usersCol.findOne({ username: cleanUsername });

    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid username or password. Access restricted to authorized team.' });
    }

    const isMatch = await bcrypt.compare(String(password).trim(), user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid username or password. Access restricted to authorized team.' });
    }

    // Update lastLogin
    await usersCol.updateOne(
      { _id: user._id },
      { $set: { lastLogin: new Date() } }
    );

    const token = signToken(user);

    return res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        username: user.username,
        displayName: user.displayName,
        role: user.role
      }
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
