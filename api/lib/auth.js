import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const JWT_SECRET = (process.env.JWT_SECRET || '').trim() || 'fixflow_outreach_fallback_jwt_secret_key_2026';
const TOKEN_EXPIRY = '7d'; // 1 week validity

/**
 * Sign a JWT token valid for 7 days
 */
export function signToken(user) {
  const payload = {
    username: user.username.toLowerCase(),
    displayName: user.displayName || user.username,
    role: user.role || 'team'
  };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

/**
 * Verify a JWT token
 */
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

/**
 * Express / Vercel Serverless Authentication Middleware
 * Injects req.user if valid, or sends 401 response and returns null
 */
export function authMiddleware(req, res) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid token' });
    return null;
  }

  const token = authHeader.split(' ')[1];
  const decoded = verifyToken(token);

  if (!decoded) {
    res.status(401).json({ error: 'Unauthorized: Token is invalid or has expired (validity is 7 days)' });
    return null;
  }

  req.user = decoded;
  return decoded;
}
