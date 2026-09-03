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

Generate two high-quality, concise messages:

1. connection_note (for a NEW LinkedIn invite):
   - Strict hard limit: under 250 characters total.
   - 1-2 concise, natural sentences. No line breaks.
   - Mention one specific technical detail about their work (their stack, project, or domain).
   - Warm peer greeting, zero pitch, zero link.

2. dm_message (for someone already connected, or after they accept your invite):
   - Format cleanly into 3 brief, scannable paragraphs separated by blank lines (\\n\\n):
     • Paragraph 1 (Genuine Personal Hook): Direct, friendly greeting referencing their specific work, stack, or experience authentically.
     • Paragraph 2 (Relatable Pain Point & Brief FixFlow Solution): Address their technical/freelancing reality. Touch on the friction of unverified resume noise in bidding or milestone payment security, and briefly note how FixFlow eliminates this with GitHub-verified repo profiles and escrow milestones. Keep it punchy and empathetic.
     • Paragraph 3 (Low-Pressure Invitation): A polite, low-friction invitation to check out fixflowai.xyz and claim their verified profile if curious, with no sales pressure.
     • Clean, simple sign-off.

Formatting Rules:
- Understated tone: at most one exclamation mark across both messages combined. No emojis.
- Never invent unmentioned facts about the person.

Respond with ONLY valid JSON with no markdown fences, no preamble, exactly this shape:
{"connection_note": "...", "dm_message": "..."}`;

  const userMsg = `Name: ${name}
Headline/bio: ${headline}
Stack/skill: ${stack || 'not specified'}
Specific hook: ${context || 'none given — keep the note generically warm rather than inventing one'}
Already connected: ${connected ? 'yes, skip connection note and frame DM as ongoing conversation' : 'no'}
LinkedIn URL: ${linkedinUrl || 'none'}`;

  const CANDIDATE_MODELS = ['gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-2.0-flash'];
  let parsed = null;
  let lastError = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: {
              parts: [{ text: system }]
            },
            contents: [
              {
                role: 'user',
                parts: [{ text: userMsg }]
              }
            ],
            generationConfig: {
              response_mime_type: 'application/json',
              temperature: 0.65
            }
          })
        }
      );

      if (geminiRes.ok) {
        const data = await geminiRes.json();
        const candidate = data.candidates?.[0];
        const raw = candidate?.content?.parts?.map(b => b.text || '').join('').trim() || '';
        const clean = raw.replace(/^```json\s*|^```\s*|```$/g, '').trim();
        parsed = JSON.parse(clean);
        break; // Success!
      } else {
        const errData = await geminiRes.json().catch(() => ({}));
        lastError = errData.error?.message || `Gemini API returned status ${geminiRes.status}`;
        // If 503 or 404, loop to next model
        if (geminiRes.status === 503 || geminiRes.status === 404) {
          continue;
        } else {
          return res.status(geminiRes.status).json({ error: lastError });
        }
      }
    } catch (err) {
      lastError = err.message;
    }
  }

  if (!parsed) {
    return res.status(500).json({ error: lastError || 'Error occurred during generation across candidate models' });
  }

  return res.status(200).json(parsed);
}

