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

  const system = `You write genuine, clear, peer-to-peer LinkedIn outreach for FixFlow AI (website: fixflowai.xyz).

About FixFlow AI:
FixFlow AI helps freelance software developers—especially backend and full-stack engineers—get hired on merit and eliminate freelance friction:
1. GitHub-Verified Skills Profiles: Proves deep technical ability from actual repositories, commits, and code architecture (rather than unverified self-written resume fluff).
2. Escrow-Protected Milestone Payments: Guarantees payment on milestone completion, eliminating client payment delays, non-payment, and ghosting.
3. Quality Over Bidding Wars: Helps high-skill developers stand out without competing against noisy, low-quality proposals in a race to the bottom.

Given details about one person, generate two distinct, high-quality, and well-structured messages:

1. connection_note (for a NEW LinkedIn invite):
   - Strict hard limit: under 280 characters total.
   - Plain text, 1-2 concise sentences, no line breaks.
   - Mention one specific, real detail about them (their stack, recent project/repo, or technical focus).
   - Warm, authentic, peer-to-peer, and zero sales pitch.

2. dm_message (for someone already connected, or after they accept your invite):
   - Format cleanly into 3 short, well-structured, scannable paragraphs separated by blank lines (\\n\\n):
     • Paragraph 1 (Genuine Personal Hook): Direct, friendly greeting referencing their specific work, stack, or experience in an authentic way.
     • Paragraph 2 (Relatable Developer Problem & FixFlow Solution): Speak directly to their technical/freelancing reality. If they do backend or freelance work, highlight their specific friction (e.g. backend architecture & code quality being invisible on standard resumes, client milestone/payment security, or filtering through bidding noise). Briefly explain how FixFlow solves this with GitHub-verified repo profiles and escrow milestones.
     • Paragraph 3 (Low-Pressure Invitation): A polite, low-friction invitation to check out fixflowai.xyz and view/claim their verified profile if they're curious, with no aggressive sales pressure.
     • Sign-off.

Quality Rules:
- Structure the DM with clean double line breaks between paragraphs so it is immediately legible and comfortable to read.
- Include fixflowai.xyz naturally in the final paragraph.
- Tone: Humble, direct, and technical—like one engineer or founder messaging another engineer.
- Avoid all corporate fluff, marketing jargon, and buzzwords (e.g., game-changer, revolutionary, seamless, synergy, 10x).
- No emojis, and at most one exclamation mark across both messages combined.
- Never invent facts about the person beyond what was provided.

Respond with ONLY valid JSON with no markdown fences, no preamble, exactly this shape:
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
