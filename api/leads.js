import { getDb } from './lib/db.js';
import { authMiddleware } from './lib/auth.js';

/**
 * Normalizes a LinkedIn profile URL for exact duplicate detection
 * e.g. "https://www.linkedin.com/in/alex-rivera/?locale=en" -> "linkedin.com/in/alex-rivera"
 */
export function normalizeLinkedinUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim().toLowerCase();
  const match = trimmed.match(/linkedin\.com\/in\/([a-z0-9_-]+)/i);
  if (match && match[1]) {
    // Strip any trailing slashes or sub-routes
    const slug = match[1].replace(/\/.*$/, '').trim();
    return `linkedin.com/in/${slug}`;
  }
  // Generic fallback normalizer
  return trimmed
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/\/$/, '')
    .split('?')[0];
}

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Enforce JWT Auth
  const user = authMiddleware(req, res);
  if (!user) return; // 401 handled

  try {
    const db = await getDb();
    const leadsCol = db.collection('leads');

    // GET /api/leads -> Retrieve pipeline leads or check duplicate URL
    if (req.method === 'GET') {
      const { createdBy, status, search, checkUrl } = req.query || {};

      // Dedicated duplicate check query
      if (checkUrl) {
        const normalized = normalizeLinkedinUrl(checkUrl);
        if (!normalized) {
          return res.status(200).json({ exists: false });
        }

        const existing = await leadsCol.findOne({
          $or: [
            { normalizedLinkedinUrl: normalized },
            { linkedinUrl: checkUrl.trim() }
          ]
        });

        if (existing) {
          return res.status(200).json({
            exists: true,
            lead: {
              id: existing.id,
              name: existing.name,
              createdBy: existing.createdBy,
              status: existing.status,
              createdAt: existing.createdAt
            }
          });
        }
        return res.status(200).json({ exists: false });
      }

      const query = {};
      if (createdBy) {
        query.createdBy = createdBy.toLowerCase();
      }
      if (status) {
        query.status = status;
      }
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { stack: { $regex: search, $options: 'i' } },
          { headline: { $regex: search, $options: 'i' } },
          { linkedinUrl: { $regex: search, $options: 'i' } }
        ];
      }

      const leads = await leadsCol.find(query).sort({ updatedAt: -1, createdAt: -1 }).toArray();
      return res.status(200).json({ leads });
    }

    // POST /api/leads -> Create or upsert a lead with duplicate prevention
    if (req.method === 'POST') {
      const {
        id,
        name,
        headline,
        stack,
        context,
        linkedinUrl,
        status = 'Contacted',
        notes = '',
        note = '',
        dm = ''
      } = req.body || {};

      if (!name || !headline) {
        return res.status(400).json({ error: 'Name and headline are required.' });
      }

      const cleanLinkedin = (linkedinUrl || '').trim();
      const normalizedUrl = normalizeLinkedinUrl(cleanLinkedin);

      // Check for duplicates across the entire database
      if (normalizedUrl) {
        const duplicate = await leadsCol.findOne({
          $or: [
            { normalizedLinkedinUrl: normalizedUrl },
            { linkedinUrl: cleanLinkedin }
          ]
        });

        if (duplicate && duplicate.id !== id) {
          return res.status(409).json({
            error: `Duplicate prospect: already in pipeline by @${duplicate.createdBy || 'team'} in status '${duplicate.status}'.`,
            existingLead: {
              id: duplicate.id,
              name: duplicate.name,
              createdBy: duplicate.createdBy,
              status: duplicate.status
            }
          });
        }
      }

      const leadDoc = {
        id: id || Date.now().toString(36) + Math.random().toString(16).slice(2, 6),
        name: name.trim(),
        headline: headline.trim(),
        stack: (stack || '').trim(),
        context: (context || '').trim(),
        linkedinUrl: cleanLinkedin,
        normalizedLinkedinUrl: normalizedUrl,
        status,
        notes,
        note,
        dm,
        createdBy: user.username,
        createdAt: new Date(),
        updatedAt: new Date(),
        lastUpdatedBy: user.username
      };

      await leadsCol.updateOne(
        { id: leadDoc.id },
        { $set: leadDoc },
        { upsert: true }
      );

      // Also mark matching history items as savedToPipeline
      try {
        const histCol = db.collection('history');
        await histCol.updateMany(
          { name: leadDoc.name, note: leadDoc.note },
          { $set: { savedToPipeline: true } }
        );
      } catch (e) {}

      return res.status(201).json({ message: 'Lead saved to pipeline', lead: leadDoc });
    }

    // PATCH /api/leads -> Update lead status or follow-up notes
    if (req.method === 'PATCH') {
      const { id, status, notes } = req.body || {};
      if (!id) {
        return res.status(400).json({ error: 'Lead id is required' });
      }

      const updateFields = {
        updatedAt: new Date(),
        lastUpdatedBy: user.username
      };

      if (status !== undefined) updateFields.status = status;
      if (notes !== undefined) updateFields.notes = notes;

      const result = await leadsCol.updateOne({ id }, { $set: updateFields });
      if (result.matchedCount === 0) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      const updatedLead = await leadsCol.findOne({ id });
      return res.status(200).json({ message: 'Lead updated', lead: updatedLead });
    }

    // DELETE /api/leads -> Delete lead from pipeline
    if (req.method === 'DELETE') {
      const id = req.body?.id || req.query?.id;
      if (!id) {
        return res.status(400).json({ error: 'Lead id is required' });
      }

      const result = await leadsCol.deleteOne({ id });
      if (result.deletedCount === 0) {
        return res.status(404).json({ error: 'Lead not found' });
      }

      return res.status(200).json({ message: 'Lead removed from pipeline', id });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[API /api/leads error]:', err);
    return res.status(500).json({
      error: err.message || 'Internal Server Error in leads service'
    });
  }
}
