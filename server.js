import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

import authHandler from './api/auth.js';
import leadsHandler from './api/leads.js';
import historyHandler from './api/history.js';
import generateHandler from './api/generate.js';
import parseProfileHandler from './api/parse-profile.js';
import { getDb } from './api/lib/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Adapter to connect Vercel serverless handlers to Express
function wrapHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res);
    } catch (err) {
      console.error('[API Error]:', err);
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || 'Internal server error' });
      }
    }
  };
}

// API Routes
app.all('/api/auth', wrapHandler(authHandler));
app.all('/api/leads', wrapHandler(leadsHandler));
app.all('/api/history', wrapHandler(historyHandler));
app.all('/api/generate', wrapHandler(generateHandler));
app.all('/api/parse-profile', wrapHandler(parseProfileHandler));

// Serve frontend static files
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Initialize database & start server
async function startServer() {
  try {
    console.log('[Server] Connecting to MongoDB Atlas...');
    await getDb();
    console.log('[Server] MongoDB connected & default users verified.');

    app.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`  FixFlow AI Outreach Copilot is live!`);
      console.log(`  Local URL: http://localhost:${PORT}`);
      console.log(`======================================================\n`);
    });
  } catch (err) {
    console.error('[Server Error] Failed to connect to MongoDB:', err.message);
    process.exit(1);
  }
}

// Only start when executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}

export default app;
