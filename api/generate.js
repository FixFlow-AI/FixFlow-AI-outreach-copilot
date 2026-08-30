export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Read Gemini API key from Vercel environment variables
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY is not configured in Vercel environment variables. Please add GEMINI_API_KEY in your Vercel Project Settings.'
    });
  }

  const { name, headline, stack, context, connected } = req.body || {};

  if (!name || !headline) {
    return res.status(400).json({ error: 'Name and headline are required.' });
  }

  const system = `You write short, specific, non-salesy LinkedIn outreach for FixFlow AI, a platform that gives freelance developers a GitHub-verified skills profile (evidence from real repos, not a self-written resume) plus escrow-protected milestone payments, so they lose less work to worse-marketed profiles and stop worrying about non-payment.

Given details about one specific person, write two things personalized to them:
1. connection_note — for a NEW LinkedIn connection request. Hard limit: 280 characters total, plain text, no line breaks. Reference one concrete detail about them. No pitch, just a genuine, specific reason to connect.
2. dm_message — for someone already connected, or as a first message after they accept. 3-5 sentences. Mention their specific work/stack, name ONE concrete pain FixFlow addresses for them (bidding noise, unverifiable profiles, or payment risk — pick whichever fits what you were told about them), end with a low-pressure invite to see their GitHub-verified profile, not a hard ask.

Rules: never invent facts about the person beyond what's given. No hype words, no emoji, at most one exclamation point across both messages combined. Sound like a specific, busy human, not a template.

Respond with ONLY valid JSON, no markdown fences, no preamble, exactly this shape:
{"connection_note": "...", "dm_message": "..."}`;

  const userMsg = `Name: ${name}
Headline/bio: ${headline}
Stack/skill: ${stack || 'not specified'}
Specific hook: ${context || 'none given — keep the note generically warm rather than inventing one'}
Already connected: ${connected ? 'yes, skip framing this as a first-touch stranger note in the DM' : 'no'}`;

  const GEMINI_MODEL = 'gemini-3.5-flash-lite';

  try {
    const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`, {
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
          temperature: 0.7
        }
      })
    });

    if (!geminiRes.ok) {
      const errData = await geminiRes.json().catch(() => ({}));
      return res.status(geminiRes.status).json({
        error: errData.error?.message || `Gemini API returned status ${geminiRes.status}`
      });
    }

    const data = await geminiRes.json();
    const candidate = data.candidates?.[0];
    const raw = candidate?.content?.parts?.map(b => b.text || '').join('').trim() || '';
    const clean = raw.replace(/^```json\s*|^```\s*|```$/g, '').trim();
    const parsed = JSON.parse(clean);

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Error occurred during generation' });
  }
}
