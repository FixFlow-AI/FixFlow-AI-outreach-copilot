import assert from 'assert';
import historyHandler from '../api/history.js';
import generateHandler from '../api/generate.js';
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

async function runGenerateTest() {
  console.log('--- Running Task 4 Test: Generation Logs & AI Prompt ---');
  try {
    const suvamToken = signToken({ username: 'suvam', displayName: 'Suvam' });

    // Test 1: Unauthenticated request to /api/history returns 401
    {
      const { req, res, getStatus } = mockReqRes({ method: 'GET' });
      await historyHandler(req, res);
      assert.strictEqual(getStatus(), 401);
      console.log('✓ Unauthenticated /api/history rejected with 401');
    }

    // Test 2: Unauthenticated request to /api/generate returns 401
    {
      const { req, res, getStatus } = mockReqRes({ method: 'POST', body: { name: 'Test' } });
      await generateHandler(req, res);
      assert.strictEqual(getStatus(), 401);
      console.log('✓ Unauthenticated /api/generate rejected with 401');
    }

    // Test 3: Save draft to history
    const testHistId = 'h_test_' + Date.now().toString(36);
    {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'POST',
        headers: { authorization: `Bearer ${suvamToken}` },
        body: {
          id: testHistId,
          name: 'Alex Rivera',
          headline: 'Full Stack Engineer | Node.js, Next.js, Postgres',
          stack: 'Node.js, Next.js',
          context: 'Building microservices, posted about client payment issues',
          note: 'Hey Alex, noticed your Next.js microservices work. Solid patterns.',
          dm: 'Hi Alex,\n\nCame across your backend work...',
          savedToPipeline: false
        }
      });
      await historyHandler(req, res);
      assert.strictEqual(getStatus(), 201);
      const item = getData().item;
      assert.strictEqual(item.generatedBy, 'suvam', 'Must be attributed to suvam');
      console.log(`✓ History item saved with generatedBy: @${item.generatedBy}`);
    }

    // Test 4: Fetch history
    {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'GET',
        headers: { authorization: `Bearer ${suvamToken}` }
      });
      await historyHandler(req, res);
      assert.strictEqual(getStatus(), 200);
      const list = getData().history;
      assert(list.some(h => h.id === testHistId), 'Saved item should be present in history');
      console.log(`✓ Fetched history list (${list.length} items)`);
    }

    // Test 5: Clean up history test item
    {
      const { req, res, getStatus } = mockReqRes({
        method: 'DELETE',
        headers: { authorization: `Bearer ${suvamToken}` },
        body: { id: testHistId }
      });
      await historyHandler(req, res);
      assert.strictEqual(getStatus(), 200);
      console.log('✓ Cleaned up history test item');
    }

    // Test 6: AI generation handling & validation with simulated Gemini response
    {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url, opts) => {
          if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com')) {
            const simulatedOutput = JSON.stringify({
              connection_note: "Hi Vikram, read your post on milestone disputes—great insights on freelancing payment friction. Always great to connect with fellow Rust engineers.",
              dm_message: "Hi Vikram,\n\nThanks for connecting. Your take on milestone disputes really resonated—getting ghosted or delayed on milestone payouts is one of the most frustrating parts of freelance engineering.\n\nWe built FixFlow AI to eliminate that exact headache with escrow-protected milestone payments and GitHub-verified repo profiles, so clients pay on milestone completion with zero disputes.\n\nIf you'd like to check it out and claim your verified profile, feel free to visit fixflowai.xyz. No pressure at all—hope the week goes well!\n\nBest,\nSuvam"
            });
            return {
              ok: true,
              json: async () => ({
                candidates: [
                  {
                    content: {
                      parts: [{ text: simulatedOutput }]
                    }
                  }
                ]
              })
            };
          }
          return originalFetch(url, opts);
        };

        const { req, res, getStatus, getData } = mockReqRes({
          method: 'POST',
          headers: { authorization: `Bearer ${suvamToken}` },
          body: {
            name: 'Vikram Mehta',
            headline: 'Backend Architect · Rust & Go · Freelance Consultant',
            stack: 'Rust, Go, Distributed DBs',
            context: 'Wrote a blog post on handling client milestone disputes'
          }
        });

        await generateHandler(req, res);
        assert.strictEqual(getStatus(), 200);
        const data = getData();
        assert(data.connection_note, 'Missing connection_note');
        assert(data.dm_message, 'Missing dm_message');
        assert(data.connection_note.length <= 250, 'Connection note must be <= 250 chars');
        
        // Assert humanized tone & zero corporate buzzwords
        const lower = data.dm_message.toLowerCase();
        assert(!lower.includes('game-changer'));
        assert(!lower.includes('revolutionary'));
        assert(!lower.includes('supercharge'));
        assert(data.dm_message.includes('fixflowai.xyz'));

        console.log('✓ AI generation validated: concise connection note (<250 chars) and humanized dev-to-dev DM');
      } finally {
        globalThis.fetch = originalFetch;
      }
    }

    console.log('All Task 4 Generation assertions passed!');
  } finally {
    await closeDb();
  }
}

await runGenerateTest();
