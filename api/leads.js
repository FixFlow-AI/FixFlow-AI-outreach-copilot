import { getDb } from './lib/db.js';
import { authMiddleware } from './lib/auth.js';

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

  const db = await getDb();
  const leadsCol = db.collection('leads');

  // GET /api/leads -> Retrieve pipeline leads
  if (req.method === 'GET') {
    const { createdBy, status, search } = req.query || {};
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
        { headline: { $regex: search, $options: 'i' } }
      ];
    }

    const leads = await leadsCol.find(query).sort({ updatedAt: -1, createdAt: -1 }).toArray();
    return res.status(200).json({ leads });
  }

  // POST /api/leads -> Create or upsert a lead
  if (req.method === 'POST') {
    const {
      id,
      name,
      headline,
      stack,
      context,
      linkedinUrl,
      note,
      dm,
      status = 'Contacted',
      notes = ''
    } = req.body || {};

    if (!name || !headline) {
      return res.status(400).json({ error: 'Name and headline are required.' });
    }

    const leadId = id || (Date.now().toString(36) + Math.random().toString(16).slice(2, 6));
    const now = new Date();

    const leadDoc = {
      id: leadId,
      name: String(name).trim(),
      headline: String(headline).trim(),
      stack: stack ? String(stack).trim() : '',
      context: context ? String(context).trim() : '',
      linkedinUrl: linkedinUrl ? String(linkedinUrl).trim() : '',
      note: note || '',
      dm: dm || '',
      status: status || 'Contacted',
      notes: notes || '',
      createdBy: user.username,
      lastUpdatedBy: user.username,
      createdAt: now,
      updatedAt: now
    };

    await leadsCol.updateOne(
      { id: leadId },
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

  // PATCH /api/leads -> Update lead status and/or follow-up notes
  if (req.method === 'PATCH') {
    const { id, status, notes } = req.body || {};
    if (!id) {
      return res.status(400).json({ error: 'Lead id is required' });
    }

    const updateFields = {
      lastUpdatedBy: user.username,
      updatedAt: new Date()
    };

    if (status !== undefined) updateFields.status = status;
    if (notes !== undefined) updateFields.notes = notes;

    const result = await leadsCol.updateOne(
      { id },
      { $set: updateFields }
    );

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
}
