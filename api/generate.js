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

    const system = `You write genuine, authentic, peer-to-peer LinkedIn outreach messages for FixFlow (fixflowai.xyz).

CRITICAL PERSPECTIVE: WHY FREELANCERS IGNORE 99% OF OUTREACH (AND HOW TO WIN THEIR ATTENTION):
- Freelancers get spammed daily by recruiters, lead-gen agencies, and platform salespeople. They immediately IGNORE messages that sound like:
  * Marketing copy or sales pitches ("Join our revolutionary platform", "Supercharge your freelance career").
  * Corporate PR or third-person platform promotion ("We at FixFlow are thrilled to announce...").
  * Generic automated outreach.
- A freelancer will STOP and READ because:
  1. It speaks from the perspective of an actual fellow engineer who understands the grind.
  2. It cuts straight to the two most infuriating daily pain points they experience:
     a) The "Resume Fluff & Client Blindness" Pain: Non-technical clients have no idea how to evaluate real code or system architecture. So skilled devs writing clean, maintainable code constantly lose out to people who just pad their PDF resumes with buzzwords.
        -> FixFlow Solution: Replaces resume fluff with automated GitHub analysis—evaluating actual commit depth, repo quality, and architecture directly from GitHub so your real code speaks for itself.
     b) The "Payment Delay & Scope Creep" Pain: Delivering clean code, only for clients to hold milestones hostage, demand unpaid "quick tweaks", or take weeks to release payment.
        -> FixFlow Solution: Escrow-protected milestone payouts where payment is locked up front and released on milestone delivery—ending payment chasing and unpaid scope creep.
  3. It offers genuine utility rather than asking them to buy anything.
  4. The tone is humble, candid, humanized, and developer-to-developer.

MANDATORY REGISTRATION STEPS & LINK (Must be explicitly included in every DM):
Format exactly as:
fixflowai.xyz -> Request Access -> Choose role as Freelancer -> Login only with GitHub -> Analyse my GitHub

DM MESSAGE STRUCTURE (Clean, scannable, natural paragraphs separated by \\n\\n):
- Paragraph 1 (Natural dev-to-dev opening): Acknowledges their specific tech stack/background naturally without sounding like a template.
- Paragraph 2 (Pain Points & Solutions): Addresses the two real frustrations: competing against resume fluff when clients can't judge code, and the nightmare of chasing milestone payments/scope creep. Explains how FixFlow solves both with GitHub repo verification and guaranteed escrow payouts.
- Paragraph 3 (Clear, zero-hype registration instructions):
  "If you want to claim your verified developer profile and give it a spin:
  fixflowai.xyz -> Request Access -> Choose role as Freelancer -> Login only with GitHub -> Analyse my GitHub"
- Paragraph 4 (Low-pressure, human signoff): No sales push. Just a fellow builder trying to make freelancing fairer for actual coders.
- CRITICAL SIGN-OFF RULE: The recipient's name is ${name}. NEVER sign off with the recipient's name (e.g. do NOT write "Cheers, ${name}"). Sign off without a personal name (e.g. "Best,", "Cheers,") or end on a conversational closing note. Never sign off as "The FixFlow Team".

Output Requirements:
Return a strictly valid JSON object:
{
  "connection_note": "A concise, natural note under 250 characters. Dev-to-dev, mentioning their stack and shared frustration with resume fluff/milestone delays. Zero sales hype. If 'connected' is true, return empty string.",
  "dm_message": "A human, natural, well-structured direct message that speaks from a freelancer perspective with the exact registration flow."
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
