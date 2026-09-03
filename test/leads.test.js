import assert from 'assert';
import leadsHandler from '../api/leads.js';
import { signToken } from '../api/lib/auth.js';
import { closeDb } from '../api/lib/db.js';

function mockReqRes({ method = 'GET', body = {}, query = {}, headers = {} }) {
  const req = {
    method,
    body,
    query,
    headers: { ...headers }
  };

  let statusCode = 200;
  let responseData = null;

  const res = {
    setHeader: () => {},
    status: (code) => {
      statusCode = code;
      return res;
    },
    json: (data) => {
      responseData = data;
      return res;
    },
    end: () => res
  };

  return { req, res, getStatus: () => statusCode, getData: () => responseData };
}

async function runLeadsTest() {
  console.log('--- Running Task 3 Test: Collaborative Pipeline CRUD, Attribution & Duplicate Guard ---');
  try {
    const suvamToken = signToken({ username: 'suvam', displayName: 'Suvam' });
    const arijitToken = signToken({ username: 'arijit', displayName: 'Arijit' });

    // Test 1: Unauthorized access without token
    {
      const { req, res, getStatus } = mockReqRes({ method: 'GET' });
      await leadsHandler(req, res);
      assert.strictEqual(getStatus(), 401, 'Unauthenticated request must return 401');
      console.log('✓ Unauthenticated request rejected with 401');
    }

    // Test 2: Create a lead as suvam with unique LinkedIn URL
    const testLeadId = 'lead_test_' + Date.now().toString(36);
    const uniqueLinkedin = 'https://www.linkedin.com/in/sarah-chen-dev-99/';
    {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'POST',
        headers: { authorization: `Bearer ${suvamToken}` },
        body: {
          id: testLeadId,
          name: 'Sarah Chen',
          headline: 'Senior Backend Engineer | Go & Distributed Systems',
          stack: 'Go, Kubernetes, Redis',
          context: 'Created an open source Raft implementation',
          linkedinUrl: uniqueLinkedin,
          note: 'Hey Sarah, saw your Raft implementation repo. Super clean consensus architecture.',
          dm: 'Hi Sarah,\n\nReally appreciated your Raft consensus project...',
          status: 'Contacted'
        }
      });
      await leadsHandler(req, res);
      assert.strictEqual(getStatus(), 201, 'Lead creation should return 201');
      const lead = getData().lead;
      assert.strictEqual(lead.id, testLeadId);
      assert.strictEqual(lead.createdBy, 'suvam', 'Lead createdBy must be suvam');
      assert.strictEqual(lead.lastUpdatedBy, 'suvam');
      assert(lead.normalizedLinkedinUrl.includes('sarah-chen-dev-99'));
      console.log(`✓ Lead created by @suvam: ${lead.name} (#${lead.id})`);
    }

    // Test 3: Duplicate detection check via GET /api/leads?checkUrl=...
    {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'GET',
        headers: { authorization: `Bearer ${arijitToken}` },
        query: { checkUrl: 'https://linkedin.com/in/sarah-chen-dev-99?trk=feed' }
      });
      await leadsHandler(req, res);
      assert.strictEqual(getStatus(), 200);
      const data = getData();
      assert.strictEqual(data.exists, true);
      assert.strictEqual(data.lead.createdBy, 'suvam');
      console.log(`✓ Duplicate check detected existing lead: reached by @${data.lead.createdBy}`);
    }

    // Test 4: Duplicate creation rejection via POST /api/leads
    {
      const secondLeadId = 'lead_dup_' + Date.now().toString(36);
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'POST',
        headers: { authorization: `Bearer ${arijitToken}` },
        body: {
          id: secondLeadId,
          name: 'Sarah Chen Duplicate',
          headline: 'Senior Backend Engineer',
          linkedinUrl: 'http://linkedin.com/in/sarah-chen-dev-99/',
          status: 'Contacted'
        }
      });
      await leadsHandler(req, res);
      assert.strictEqual(getStatus(), 409, 'Duplicate lead must be rejected with 409 Conflict');
      const err = getData().error;
      assert(err.includes('Duplicate Profile'));
      console.log(`✓ Duplicate outreach attempt by @arijit was safely blocked (409 Conflict)`);
    }

    // Test 5: Get leads and verify
    {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'GET',
        headers: { authorization: `Bearer ${suvamToken}` }
      });
      await leadsHandler(req, res);
      assert.strictEqual(getStatus(), 200);
      const leads = getData().leads;
      const found = leads.find(l => l.id === testLeadId);
      assert(found, 'Created lead should be in GET leads response');
      assert.strictEqual(found.name, 'Sarah Chen');
      console.log(`✓ Fetched leads list successfully (${leads.length} total leads)`);
    }

    // Test 6: Update lead as arijit (verifying collaborative attribution)
    {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'PATCH',
        headers: { authorization: `Bearer ${arijitToken}` },
        body: {
          id: testLeadId,
          status: 'Interested',
          notes: 'Replied on LinkedIn! Scheduled intro call for Friday.'
        }
      });
      await leadsHandler(req, res);
      assert.strictEqual(getStatus(), 200);
      const updated = getData().lead;
      assert.strictEqual(updated.status, 'Interested');
      assert.strictEqual(updated.createdBy, 'suvam', 'Original author must remain suvam');
      assert.strictEqual(updated.lastUpdatedBy, 'arijit', 'Updater must be attributed to arijit');
      console.log(`✓ Lead updated by @arijit: stage='Interested', updater='arijit', author='suvam'`);
    }

    // Test 7: Delete lead
    {
      const { req, res, getStatus } = mockReqRes({
        method: 'DELETE',
        headers: { authorization: `Bearer ${suvamToken}` },
        body: { id: testLeadId }
      });
      await leadsHandler(req, res);
      assert.strictEqual(getStatus(), 200);
      console.log('✓ Lead deleted from pipeline successfully');
    }

    console.log('All Task 3 Leads CRUD & Duplicate Guard assertions passed!');
  } finally {
    await closeDb();
  }
}

await runLeadsTest();
