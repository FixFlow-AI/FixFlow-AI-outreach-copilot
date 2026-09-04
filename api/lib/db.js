import { MongoClient } from 'mongodb';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load .env from project root if not already loaded
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const uri = process.env.DB_CONNECTION_URL;
const DB_NAME = 'fixflow_outreach';

let cachedClient = null;
let cachedDb = null;
let lastFailedTime = 0;
let lastFailedError = null;
const RETRY_COOLDOWN_MS = 15000;

// Initial authorized team credentials to seed into MongoDB
export const DEFAULT_USERS = [
  { username: 'suvam', password: 'Suvam@cto143', displayName: 'Suvam (CTO)', role: 'team' },
  { username: 'arijit', password: 'Arijit@ceo997', displayName: 'Arijit (CEO)', role: 'team' },
  { username: 'ritesh', password: 'Ritesh@fixflowai2030', displayName: 'Ritesh', role: 'team' }
];

export async function getDb() {
  if (cachedDb) {
    return cachedDb;
  }

  const connectionUri = (process.env.DB_CONNECTION_URL || uri || '').trim();
  if (!connectionUri) {
    throw new Error('DB_CONNECTION_URL is not configured. Please set DB_CONNECTION_URL in your Vercel Project Settings (Settings -> Environment Variables).');
  }

  if (Date.now() - lastFailedTime < RETRY_COOLDOWN_MS && lastFailedError) {
    throw lastFailedError;
  }

  if (!cachedClient) {
    try {
      const client = new MongoClient(connectionUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 4000,
        connectTimeoutMS: 4000
      });
      await client.connect();
      cachedClient = client;
      lastFailedTime = 0;
      lastFailedError = null;
    } catch (connErr) {
      cachedClient = null;
      cachedDb = null;
      const msg = connErr.message || '';
      console.error('[DB] Connection failure:', msg);

      let formattedErr;
      if (msg.includes('SSL alert number 80') || msg.includes('tlsv1 alert internal error') || msg.includes('ServerSelectionError') || msg.includes('ReplicaSetNoPrimary')) {
        formattedErr = new Error(
          'MongoDB Atlas connection rejected (SSL alert 80 / IP not whitelisted). ' +
          'Vercel dynamic IPs are blocked by default. Please go to MongoDB Atlas -> Network Access -> Add IP Address -> Select "Allow Access from Anywhere" (0.0.0.0/0).'
        );
      } else if (msg.includes('bad auth') || msg.includes('Authentication failed')) {
        formattedErr = new Error(
          'MongoDB Atlas authentication failed. Please verify database username and password in DB_CONNECTION_URL.'
        );
      } else {
        formattedErr = new Error(`MongoDB connection error: ${msg}`);
      }

      lastFailedTime = Date.now();
      lastFailedError = formattedErr;
      throw formattedErr;
    }
  }

  cachedDb = cachedClient.db(DB_NAME);

  // Initialize collections & seed users if not present
  try {
    await initDatabase(cachedDb);
  } catch (initErr) {
    console.error('[DB] initDatabase warning:', initErr.message);
  }

  return cachedDb;
}

export async function initDatabase(db) {
  try {
    const usersCol = db.collection('users');
    await usersCol.createIndex({ username: 1 }, { unique: true });

    // Seed default users if missing
    for (const u of DEFAULT_USERS) {
      const existing = await usersCol.findOne({ username: u.username.toLowerCase() });
      if (!existing) {
        const passwordHash = await bcrypt.hash(u.password, 10);
        await usersCol.insertOne({
          username: u.username.toLowerCase(),
          passwordHash,
          displayName: u.displayName,
          role: u.role,
          createdAt: new Date(),
          lastLogin: null
        });
        console.log(`[DB] Seeded authorized user: ${u.username}`);
      }
    }

    // Ensure indexes for leads
    const leadsCol = db.collection('leads');
    await leadsCol.createIndex({ id: 1 }, { unique: true });
    await leadsCol.createIndex({ normalizedLinkedinUrl: 1 });
    await leadsCol.createIndex({ updatedAt: -1 });

    // Ensure indexes for history
    const histCol = db.collection('history');
    await histCol.createIndex({ id: 1 }, { unique: true });
    await histCol.createIndex({ generatedAt: -1 });
  } catch (err) {
    console.error('[DB] Error during initDatabase:', err.message);
  }
}

export async function closeDb() {
  if (cachedClient) {
    await cachedClient.close();
    cachedClient = null;
    cachedDb = null;
  }
}
