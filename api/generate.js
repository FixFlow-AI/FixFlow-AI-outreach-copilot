import { authMiddleware } from './lib/auth.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Only allow POST
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Enforce JWT Auth
    const user = authMiddleware(req, res);
    if (!user) return; // 401 handled

    // Read Gemini API key from request body or environment variables
    const apiKey = (req.body?.apiKey || process.env.GEMINI_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(400).json({
        error: 'GEMINI_API_KEY is not configured. Please add GEMINI_API_KEY to your .env file or enter your API key in the settings.'
      });
    }

    const { name, headline, stack, context, connected, linkedinUrl } = req.body || {};

    if (!name || !headline) {
      return res.status(400).json({ error: 'Name and headline are required.' });
    }

    const system = `You write genuine, concise, peer-to-peer LinkedIn outreach messages for FixFlow AI (fixflowai.xyz).

Core Philosophy:
- Write like a fellow engineer or founder messaging an engineer directly.
- Strictly ZERO sales or marketing speak, ZERO corporate buzzwords (no "game-changer", "revolutionary", "seamless", "synergy", "10x", "supercharge").
- Address real freelance developer pain points with our brief, tangible solution.
- Genuine, humble, simple, and humanized.

Developer Pain Points & FixFlow AI Solution:
1. Pain Point: Standard resumes hide actual code quality. In freelance bidding, top engineers get drowned out by noisy, unverified fluff.
   FixFlow Solution: GitHub-Verified Skills Profiles that verify real technical competence from actual repositories and code architecture.
2. Pain Point: Milestone payment anxiety—clients delaying milestone payouts, scope creep, or ghosting after delivery.
   FixFlow Solution: Escrow-protected milestone payouts, guaranteeing payment upon milestone completion.

Output Requirements:
Return a strictly valid JSON object:
{
  "connection_note": "A concise, natural note under 250 characters. Brief pain point mention, simple solution question. No pitches, no buzzwords. If 'connected' is true, return empty string.",
  "dm_message": "A concise, humble direct message under 600 characters. 3-4 sentences max. Highlight how GitHub repo verification beats resume clutter, mention escrow milestone safety, and ask an open feedback question."
}`;

    const prompt = `Prospect Profile:
- Name: ${name}
- Headline: ${headline}
- Tech Stack: ${stack || 'Full-stack / Software Development'}
- Context / Recent Work: ${context || 'None specified'}
- LinkedIn Profile: ${linkedinUrl || 'Not provided'}
- Already 1st Degree Connection?: ${connected ? 'Yes' : 'No'}

Generate an authentic, concise connection note (if not connected) and direct message now. Return ONLY JSON.`;

    const MODEL = 'gemini-3.5-flash-lite';

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${system}\n\n${prompt}` }]
            }
          ],
          generationConfig: {
            response_mime_type: 'application/json',
            temperature: 0.65
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      const errorMsg = errData.error?.message || `Gemini API returned status ${geminiRes.status}`;
      return res.status(geminiRes.status).json({ error: errorMsg });
    }

    const data = await geminiRes.json();
    const candidate = data.candidates?.[0];
    const raw = candidate?.content?.parts?.map(b => b.text || '').join('').trim() || '';
    const clean = raw.replace(/^```json\s*|^```\s*|```$/g, '').trim();

    let parsed = null;
    try {
      parsed = JSON.parse(clean);
    } catch (parseErr) {
      return res.status(500).json({ error: 'Failed to parse JSON response from Gemini 3.5 Flash Lite' });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('[API /api/generate error]:', err);
    return res.status(500).json({
      error: err.message || 'Internal Server Error in generation service'
    });
  }
}
