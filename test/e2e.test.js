import assert from 'assert';
import authHandler from '../api/auth.js';
import leadsHandler from '../api/leads.js';
import historyHandler from '../api/history.js';
import parseHandler from '../api/parse-profile.js';
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

async function runE2ETest() {
  console.log('===============================================================');
  console.log('  RUNNING FULL END-TO-END WORKFLOW VERIFICATION');
  console.log('===============================================================\n');

  try {
    // 1. Unauthenticated request to /api/leads must be rejected
    {
      const { req, res, getStatus } = mockReqRes({ method: 'GET' });
      await leadsHandler(req, res);
      assert.strictEqual(getStatus(), 401);
      console.log('1. [Auth Guard] Unauthenticated request safely blocked with 401');
    }

    // 2. Login as suvam
    let suvamToken = null;
    {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'POST',
        body: { username: 'suvam', password: 'Suvam@cto143' }
      });
      await authHandler(req, res);
      assert.strictEqual(getStatus(), 200);
      const data = getData();
      assert(data.token);
      assert.strictEqual(data.user.username, 'suvam');
      suvamToken = data.token;
      console.log('2. [Login] Logged in successfully as @suvam (7-day JWT issued)');
    }

    // 3. Test LinkedIn profile parser
    let parsedName = '';
    {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'POST',
        headers: { authorization: `Bearer ${suvamToken}` },
        body: { url: 'https://www.linkedin.com/in/rahul-verma-lead-dev/' }
      });
      await parseHandler(req, res);
      assert.strictEqual(getStatus(), 200);
      const data = getData();
      assert.strictEqual(data.success, true);
      assert.strictEqual(data.name, 'Rahul Verma Lead Dev');
      parsedName = data.name;
      console.log(`3. [LinkedIn Parser] Auto-parsed name from URL: "${parsedName}"`);
    }

    // 4. Save new lead to MongoDB pipeline as @suvam
    const leadId = 'e2e_lead_' + Date.now().toString(36);
    {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'POST',
        headers: { authorization: `Bearer ${suvamToken}` },
        body: {
          id: leadId,
          name: parsedName,
          headline: 'Lead Cloud Architect · Go, AWS, Terraform',
          stack: 'Go, Kubernetes, AWS',
          context: 'Discussed freelance payment delays on Twitter',
          linkedinUrl: 'https://www.linkedin.com/in/rahul-verma-lead-dev/',
          note: 'Hey Rahul, saw your cloud architecture work—really impressive infrastructure patterns.',
          dm: 'Hi Rahul,\n\nThanks for connecting. Really liked your take on cloud architecture...',
          status: 'Contacted'
        }
      });
      await leadsHandler(req, res);
      assert.strictEqual(getStatus(), 201);
      const lead = getData().lead;
      assert.strictEqual(lead.createdBy, 'suvam');
      assert.strictEqual(lead.lastUpdatedBy, 'suvam');
      console.log(`4. [Pipeline Save] Lead saved to MongoDB by @suvam with attribution (#${lead.id})`);
    }

    // 5. Login as another authorized user: arijit
    let arijitToken = null;
    {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'POST',
        body: { username: 'arijit', password: 'Arijit@ceo997' }
      });
      await authHandler(req, res);
      assert.strictEqual(getStatus(), 200);
      arijitToken = getData().token;
      console.log('5. [Login] Logged in as second team member: @arijit');
    }

    // 6. As @arijit, fetch team pipeline and verify seeing @suvam's lead
    {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'GET',
        headers: { authorization: `Bearer ${arijitToken}` }
      });
      await leadsHandler(req, res);
      assert.strictEqual(getStatus(), 200);
      const leads = getData().leads;
      const found = leads.find(l => l.id === leadId);
      assert(found, 'Lead created by suvam must be visible in shared pipeline to arijit');
      assert.strictEqual(found.createdBy, 'suvam');
      console.log(`6. [Shared Pipeline] @arijit accessed shared team pipeline and found lead created by @suvam`);
    }

    // 7. As @arijit, update lead's stage and follow-up notes in MongoDB
    {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'PATCH',
        headers: { authorization: `Bearer ${arijitToken}` },
        body: {
          id: leadId,
          status: 'Verified Profile',
          notes: 'Completed onboarding call! Connected GitHub repository and verified top Go skills.'
        }
      });
      await leadsHandler(req, res);
      assert.strictEqual(getStatus(), 200);
      const updated = getData().lead;
      assert.strictEqual(updated.status, 'Verified Profile');
      assert.strictEqual(updated.createdBy, 'suvam', 'Original author must remain suvam');
      assert.strictEqual(updated.lastUpdatedBy, 'arijit', 'Last updater must be attributed to arijit');
      console.log(`7. [Collaborative Update] Lead updated by @arijit (stage: 'Verified Profile', author: @suvam, updater: @arijit)`);
    }

    // 8. Log generation history as @arijit
    const histId = 'e2e_hist_' + Date.now().toString(36);
    {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'POST',
        headers: { authorization: `Bearer ${arijitToken}` },
        body: {
          id: histId,
          name: 'Priya Sharma',
          headline: 'Full-Stack Developer · React & Python',
          stack: 'React, Django',
          note: 'Hey Priya, loved your open source Django work.',
          dm: 'Hi Priya,\n\nThanks for connecting...',
          savedToPipeline: false
        }
      });
      await historyHandler(req, res);
      assert.strictEqual(getStatus(), 201);
      const item = getData().item;
      assert.strictEqual(item.generatedBy, 'arijit');
      console.log(`8. [History Log] Generation logged in MongoDB with generatedBy: @${item.generatedBy}`);
    }

    // 9. Clean up test records
    {
      const { req, res } = mockReqRes({
        method: 'DELETE',
        headers: { authorization: `Bearer ${suvamToken}` },
        body: { id: leadId }
      });
      await leadsHandler(req, res);

      const { req: hReq, res: hRes } = mockReqRes({
        method: 'DELETE',
        headers: { authorization: `Bearer ${suvamToken}` },
        body: { id: histId }
      });
      await historyHandler(hReq, hRes);
      console.log('9. [Cleanup] Cleaned up E2E temporary records from MongoDB');
    }

    console.log('\n===============================================================');
    console.log('  ALL E2E WORKFLOW VERIFICATIONS PASSED SUCCESSFULLY!');
    console.log('===============================================================\n');
  } finally {
    await closeDb();
  }
}

await runE2ETest();
