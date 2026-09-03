import assert from 'assert';
import jwt from 'jsonwebtoken';
import handler from '../api/auth.js';
import { closeDb } from '../api/lib/db.js';

// Helper to mock req/res for serverless handlers
function mockReqRes({ method = 'POST', body = {}, headers = {} }) {
  const req = {
    method,
    body,
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

async function runAuthTest() {
  console.log('--- Running Task 2 Test: JWT Auth & Login Endpoint ---');
  try {
    // Test 1: Invalid username/password
    {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'POST',
        body: { username: 'suvam', password: 'WrongPassword123' }
      });
      await handler(req, res);
      assert.strictEqual(getStatus(), 401, 'Expected 401 for wrong password');
      console.log('✓ Invalid password correctly rejected with 401');
    }

    // Test 2: Unknown user
    {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'POST',
        body: { username: 'unknown_hacker', password: 'password' }
      });
      await handler(req, res);
      assert.strictEqual(getStatus(), 401, 'Expected 401 for unknown user');
      console.log('✓ Unauthorized username correctly rejected with 401');
    }

    // Test 3: Successful login for suvam
    let suvamToken = null;
    {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'POST',
        body: { username: 'suvam', password: 'Suvam@cto143' }
      });
      await handler(req, res);
      assert.strictEqual(getStatus(), 200, 'Expected 200 for valid login');
      const data = getData();
      assert(data.token, 'Response missing JWT token');
      assert.strictEqual(data.user.username, 'suvam');
      suvamToken = data.token;

      // Verify JWT expiration is ~7 days (604800 seconds)
      const decoded = jwt.decode(suvamToken);
      const expiresInSec = decoded.exp - decoded.iat;
      assert.strictEqual(expiresInSec, 7 * 24 * 60 * 60, 'Token expiration must be exactly 7 days');
      console.log(`✓ Valid login succeeded! JWT issued with 7-day validity (${expiresInSec}s)`);
    }

    // Test 4: Verify session with GET /api/auth using Bearer token
    {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'GET',
        headers: { authorization: `Bearer ${suvamToken}` }
      });
      await handler(req, res);
      assert.strictEqual(getStatus(), 200, 'Expected 200 for valid session');
      const data = getData();
      assert.strictEqual(data.authenticated, true);
      assert.strictEqual(data.user.username, 'suvam');
      console.log('✓ Session verification succeeded with Bearer token');
    }

    // Test 5: Verify session with missing token
    {
      const { req, res, getStatus } = mockReqRes({
        method: 'GET',
        headers: {}
      });
      await handler(req, res);
      assert.strictEqual(getStatus(), 401, 'Expected 401 for missing token');
      console.log('✓ Missing token rejected with 401');
    }

    // Test 6: Verify login for other team members
    for (const [user, pass] of [['arijit', 'Arijit@ceo997'], ['ritesh', 'Ritesh@fixflowai2030']]) {
      const { req, res, getStatus, getData } = mockReqRes({
        method: 'POST',
        body: { username: user, password: pass }
      });
      await handler(req, res);
      assert.strictEqual(getStatus(), 200, `Expected 200 for ${user}`);
      assert(getData().token, `Missing token for ${user}`);
      console.log(`✓ Verified authorized login for team member: ${user}`);
    }

    console.log('All Task 2 Auth assertions passed!');
  } finally {
    await closeDb();
  }
}

runAuthTest().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Task 2 Test failed:', err);
  process.exit(1);
});
