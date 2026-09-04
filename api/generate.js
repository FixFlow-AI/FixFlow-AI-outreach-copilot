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

    // Read API keys from request body or environment variables
    let geminiApiKey = (req.body?.apiKey || process.env.GEMINI_API_KEY || '').trim();
    let groqApiKey = (req.body?.groqApiKey || process.env.GROQ_API_KEY || process.env.groq_api || '').trim();

    // Auto-detect Groq key if user passed a gsk_ key in apiKey
    if (geminiApiKey.startsWith('gsk_')) {
      groqApiKey = geminiApiKey;
      geminiApiKey = (process.env.GEMINI_API_KEY || '').trim();
    }

    if (!geminiApiKey && !groqApiKey) {
      return res.status(400).json({
        error: 'No AI API key configured. Please set GEMINI_API_KEY or GROQ_API_KEY in your .env file or enter your API key in settings.'
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

    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    let parsed = null;
    let lastErrorMsg = null;

    // 1. PRIMARY TIER: Google Gemini (Primary: Gemini 3.1 Flash Lite, Fallbacks: 3.5 Flash, 3.6 Flash, 3.5 Flash Lite)
    if (geminiApiKey) {
      const GEMINI_MODELS = ['gemini-3.1-flash-lite', 'gemini-3.5-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];

      for (const model of GEMINI_MODELS) {
        const maxRetries = (model === 'gemini-3.1-flash-lite') ? 2 : 1;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 9000); // 9s fast timeout

            const geminiRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiApiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: controller.signal,
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
            clearTimeout(timeoutId);

            if (!geminiRes.ok) {
              const errData = await geminiRes.json().catch(() => ({}));
              const errorMsg = errData.error?.message || `Gemini API returned status ${geminiRes.status}`;
              lastErrorMsg = errorMsg;

              const isTransient =
                geminiRes.status === 503 ||
                geminiRes.status === 429 ||
                /demand|unavailable|overloaded|busy|temporary|quota|resource_exhausted/i.test(errorMsg);

              if (isTransient && attempt < maxRetries) {
                console.warn(`[Gemini ${model}] Transient capacity spike (attempt ${attempt}): ${errorMsg}. Retrying in 1000ms...`);
                await sleep(1000 * attempt);
                continue;
              }

              console.warn(`[Gemini ${model}] Failed (${errorMsg}). Moving to next fallback.`);
              break;
            }

            const data = await geminiRes.json();
            const candidate = data.candidates?.[0];
            const raw = candidate?.content?.parts?.map(b => b.text || '').join('').trim() || '';
            const clean = raw.replace(/^```json\s*|^```\s*|```$/g, '').trim();

            try {
              parsed = JSON.parse(clean);
              console.log(`[Generation Success] Delivered via Gemini (${model})`);
              break;
            } catch (parseErr) {
              lastErrorMsg = `Failed to parse JSON response from ${model}`;
              break;
            }
          } catch (fetchErr) {
            lastErrorMsg = fetchErr.name === 'AbortError'
              ? `Request timed out on ${model}`
              : fetchErr.message;
            console.warn(`[Gemini ${model}] Attempt ${attempt} error: ${lastErrorMsg}`);
            if (attempt < maxRetries) {
              await sleep(1000 * attempt);
              continue;
            }
            break;
          }
        }

        if (parsed) break;
      }
    }

    // 2. FALLBACK TIER: Groq Cloud (Models: openai/gpt-oss-120b, openai/gpt-oss-20b, qwen/qwen3.8-27b)
    // Used when Gemini API key is missing OR when all Gemini models fail / are overloaded
    if (!parsed && groqApiKey) {
      console.log('[Generation Fallback] Activating Groq fallback provider...');
      const GROQ_MODELS = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];

      for (const model of GROQ_MODELS) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 8000); // 8s fast timeout

          const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${groqApiKey}`
            },
            signal: controller.signal,
            body: JSON.stringify({
              model,
              response_format: { type: 'json_object' },
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: prompt }
              ],
              temperature: 0.65
            })
          });
          clearTimeout(timeoutId);

          if (!groqRes.ok) {
            const errData = await groqRes.json().catch(() => ({}));
            const errorMsg = errData.error?.message || `Groq API returned status ${groqRes.status}`;
            lastErrorMsg = errorMsg;
            console.warn(`[Groq ${model}] Failed: ${errorMsg}`);
            continue;
          }

          const data = await groqRes.json();
          const content = data.choices?.[0]?.message?.content || '';
          const clean = content.replace(/^```json\s*|^```\s*|```$/g, '').trim();

          try {
            parsed = JSON.parse(clean);
            console.log(`[Generation Success] Delivered via Groq (${model})`);
            break;
          } catch (parseErr) {
            lastErrorMsg = `Failed to parse JSON response from Groq (${model})`;
          }
        } catch (groqErr) {
          lastErrorMsg = groqErr.name === 'AbortError'
            ? `Request timed out on Groq ${model}`
            : groqErr.message;
          console.warn(`[Groq ${model}] Error: ${lastErrorMsg}`);
        }
      }
    }

    if (!parsed) {
      return res.status(503).json({
        error: lastErrorMsg || 'All generation models (Gemini & Groq) are currently unavailable. Please try again in a few moments.'
      });
    }

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('[API /api/generate error]:', err);
    return res.status(500).json({
      error: err.message || 'Internal Server Error in generation service'
    });
  }
}
