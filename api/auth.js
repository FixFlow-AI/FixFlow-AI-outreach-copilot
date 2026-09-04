import bcrypt from 'bcryptjs';
import { getDb, DEFAULT_USERS } from './lib/db.js';
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

  // GET /api/auth -> Verify current token session (Cryptographic verification)
  if (req.method === 'GET') {
    try {
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
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to verify session' });
    }
  }

  // POST /api/auth -> Login
  if (req.method === 'POST') {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const cleanUsername = String(username).trim().toLowerCase();
    const cleanPassword = String(password).trim();

    // 1. Attempt MongoDB database authentication first
    let dbErrorMsg = '';

    try {
      const db = await getDb();
      const usersCol = db.collection('users');
      const user = await usersCol.findOne({ username: cleanUsername });

      if (user && user.passwordHash) {
        const isMatch = await bcrypt.compare(cleanPassword, user.passwordHash);
        if (!isMatch) {
          return res.status(401).json({ error: 'Invalid username or password. Access restricted to authorized team.' });
        }

        // Update lastLogin in background
        usersCol.updateOne(
          { _id: user._id },
          { $set: { lastLogin: new Date() } }
        ).catch(() => {});

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
      } else if (user === null) {
        // User searched in DB and explicitly not found
        return res.status(401).json({ error: 'Invalid username or password. Access restricted to authorized team.' });
      }
    } catch (err) {
      console.warn('[Auth] MongoDB connection unavailable during login:', err.message);
      dbErrorMsg = err.message;
    }

    // 2. If MongoDB connection failed (e.g. Atlas IP whitelist pending), authenticate authorized team members directly
    const defaultUser = DEFAULT_USERS.find(u => u.username.toLowerCase() === cleanUsername);
    if (defaultUser) {
      if (defaultUser.password !== cleanPassword) {
        return res.status(401).json({ error: 'Invalid username or password. Access restricted to authorized team.' });
      }

      const token = signToken(defaultUser);
      return res.status(200).json({
        message: 'Login successful',
        token,
        user: {
          username: defaultUser.username,
          displayName: defaultUser.displayName,
          role: defaultUser.role
        },
        warning: dbErrorMsg || 'MongoDB is currently offline. Running in local sync mode.'
      });
    }

    return res.status(401).json({ error: 'Invalid username or password. Access restricted to authorized team.' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
