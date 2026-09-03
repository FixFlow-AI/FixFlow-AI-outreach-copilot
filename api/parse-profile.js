import { authMiddleware } from './lib/auth.js';

/**
 * Format a name from a LinkedIn profile slug
 * e.g. "john-doe-49a0b" -> "John Doe"
 */
function parseNameFromSlug(slug) {
  if (!slug) return '';
  // Remove trailing alphanumeric hash/ID if present (e.g., -49a0b12 or -12345678)
  const cleaned = slug.replace(/-[a-f0-9]{4,12}$/i, '').replace(/-[0-9]+$/, '');
  return cleaned
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

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

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Enforce JWT Auth
  const user = authMiddleware(req, res);
  if (!user) return; // 401 response handled

  const { url } = req.body || {};
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'LinkedIn profile URL is required' });
  }

  const trimmedUrl = url.trim();

  // Extract slug from URL: linkedin.com/in/{slug}
  const slugMatch = trimmedUrl.match(/linkedin\.com\/in\/([a-zA-Z0-9_-]+)/i);
  const slug = slugMatch ? slugMatch[1] : '';
  const fallbackName = parseNameFromSlug(slug);

  let extractedName = fallbackName;
  let extractedHeadline = '';
  let hitAuthWall = false;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const response = await fetch(trimmedUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9'
      }
    });
    clearTimeout(timeout);

    if (response.status === 999 || response.status === 403 || response.status === 429) {
      hitAuthWall = true;
    } else if (response.ok) {
      const html = await response.text();

      // Extract OpenGraph tags
      const ogTitleMatch = html.match(/<meta property="og:title" content="([^"]+)"/i) || html.match(/<title>([^<]+)<\/title>/i);
      const ogDescMatch = html.match(/<meta property="og:description" content="([^"]+)"/i) || html.match(/<meta name="description" content="([^"]+)"/i);

      if (ogTitleMatch && ogTitleMatch[1]) {
        let title = ogTitleMatch[1].replace(/ \| LinkedIn/i, '').replace(/ - LinkedIn/i, '').trim();
        // Often format is: "John Doe - Software Engineer"
        const parts = title.split(' - ');
        if (parts.length >= 2) {
          extractedName = parts[0].trim();
          extractedHeadline = parts.slice(1).join(' - ').trim();
        } else {
          extractedName = title;
        }
      }

      if (!extractedHeadline && ogDescMatch && ogDescMatch[1]) {
        extractedHeadline = ogDescMatch[1].trim();
      }
    }
  } catch (err) {
    hitAuthWall = true;
  }

  return res.status(200).json({
    success: true,
    name: extractedName,
    headline: extractedHeadline,
    linkedinUrl: trimmedUrl,
    requiresManualInput: hitAuthWall || !extractedHeadline,
    message: hitAuthWall
      ? 'LinkedIn login-wall encountered. Extracted profile name from link; paste their headline directly below.'
      : 'Profile information retrieved.'
  });
}
