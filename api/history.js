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
  if (!user) return; // 401 response handled

  const db = await getDb();
  const histCol = db.collection('history');

  // GET /api/history -> Fetch generation history
  if (req.method === 'GET') {
    const { search } = req.query || {};
    const query = {};

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { stack: { $regex: search, $options: 'i' } },
        { headline: { $regex: search, $options: 'i' } },
        { context: { $regex: search, $options: 'i' } },
        { note: { $regex: search, $options: 'i' } },
        { dm: { $regex: search, $options: 'i' } }
      ];
    }

    const history = await histCol.find(query).sort({ generatedAt: -1 }).toArray();
    return res.status(200).json({ history });
  }

  // POST /api/history -> Save generated draft log
  if (req.method === 'POST') {
    const {
      id,
      name,
      headline,
      stack,
      context,
      linkedinUrl,
      connected,
      note,
      dm,
      savedToPipeline = false
    } = req.body || {};

    if (!name || !headline) {
      return res.status(400).json({ error: 'Name and headline are required.' });
    }

    const histId = id || ('h_' + Date.now().toString(36) + Math.random().toString(16).slice(2, 6));

    const historyDoc = {
      id: histId,
      name: String(name).trim(),
      headline: String(headline).trim(),
      stack: stack ? String(stack).trim() : '',
      context: context ? String(context).trim() : '',
      linkedinUrl: linkedinUrl ? String(linkedinUrl).trim() : '',
      connected: !!connected,
      note: note || '',
      dm: dm || '',
      savedToPipeline: !!savedToPipeline,
      generatedBy: user.username,
      generatedAt: new Date()
    };

    await histCol.updateOne(
      { id: histId },
      { $set: historyDoc },
      { upsert: true }
    );

    return res.status(201).json({ message: 'History saved', item: historyDoc });
  }

  // DELETE /api/history -> Delete single item or clear history
  if (req.method === 'DELETE') {
    const { id, clearAll } = req.body || req.query || {};

    if (clearAll) {
      await histCol.deleteMany({});
      return res.status(200).json({ message: 'All generation history cleared' });
    }

    if (id) {
      await histCol.deleteOne({ id });
      return res.status(200).json({ message: 'History item removed', id });
    }

    return res.status(400).json({ error: 'id or clearAll parameter is required' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
