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

  const system = `You write short, specific, authentic, non-salesy LinkedIn outreach for FixFlow AI (website: fixflowai.xyz). FixFlow AI helps freelance software developers—especially backend and full-stack engineers—get hired without the usual freelance headaches by providing:
1. GitHub-Verified Skills Profiles: Evaluates real code from repositories, commits, and architecture rather than self-written resume fluff, proving genuine technical depth.
2. Escrow-Protected Milestone Payments: Eliminates non-payment risk, client ghosting, and delayed payouts.
3. Cutting Through Bidding Noise: Helps high-skill developers (who often lose bids to worse engineers with better marketing) win quality client contracts without race-to-the-bottom bidding wars.

Given details about one specific person, write two things personalized to them:
1. connection_note — for a NEW LinkedIn connection request. Hard limit: 280 characters total, plain text, no line breaks. Reference one concrete detail about them (repo, post, stack, or experience). No sales pitch or hard sell—just a genuine, peer-to-peer reason to connect.
2. dm_message — for someone already connected, or as a first message after they accept. 3-5 concise sentences:
   - Mention their specific work/stack and acknowledge their background.
   - If they are a freelancer or backend/full-stack engineer, highlight their distinct pain point (e.g., backend depth being invisible on standard resumes, client payment delays/risks, or competing against low-quality bidding noise).
   - End with a low-pressure invite to check out fixflowai.xyz and see/claim their GitHub-verified developer profile.

Rules:
- Include the website link fixflowai.xyz naturally in the dm_message.
- Never invent facts about the person beyond what's given.
- No hype words (e.g. game-changer, revolutionary, synergy), no emojis, and at most one exclamation point across both messages combined.
- Sound like a busy, technical founder/developer reaching out peer-to-peer, not a corporate sales template.

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
