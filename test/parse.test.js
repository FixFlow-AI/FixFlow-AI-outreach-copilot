import assert from 'assert';
import parseHandler from '../api/parse-profile.js';
import { signToken } from '../api/lib/auth.js';

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

async function runParseTest() {
  console.log('--- Running Task 5 Test: LinkedIn Profile URL Parser ---');

  const suvamToken = signToken({ username: 'suvam', displayName: 'Suvam' });

  // Test 1: Unauthenticated request returns 401
  {
    const { req, res, getStatus } = mockReqRes({
      method: 'POST',
      body: { url: 'https://www.linkedin.com/in/john-doe' }
    });
    await parseHandler(req, res);
    assert.strictEqual(getStatus(), 401);
    console.log('✓ Unauthenticated request rejected with 401');
  }

  // Test 2: Missing URL returns 400
  {
    const { req, res, getStatus } = mockReqRes({
      method: 'POST',
      headers: { authorization: `Bearer ${suvamToken}` },
      body: {}
    });
    await parseHandler(req, res);
    assert.strictEqual(getStatus(), 400);
    console.log('✓ Missing URL rejected with 400');
  }

  // Test 3: Parse standard LinkedIn URL slug
  {
    const { req, res, getStatus, getData } = mockReqRes({
      method: 'POST',
      headers: { authorization: `Bearer ${suvamToken}` },
      body: { url: 'https://www.linkedin.com/in/suvam-adhikary' }
    });
    await parseHandler(req, res);
    assert.strictEqual(getStatus(), 200);
    const data = getData();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.name, 'Suvam Adhikary');
    console.log(`✓ Parsed slug into name: ${data.name}`);
  }

  // Test 4: Parse URL with trailing hash/id
  {
    const { req, res, getStatus, getData } = mockReqRes({
      method: 'POST',
      headers: { authorization: `Bearer ${suvamToken}` },
      body: { url: 'https://linkedin.com/in/alex-smith-4891b29/' }
    });
    await parseHandler(req, res);
    assert.strictEqual(getStatus(), 200);
    const data = getData();
    assert.strictEqual(data.name, 'Alex Smith');
    console.log(`✓ Cleaned trailing hash into clean name: ${data.name}`);
  }

  console.log('All Task 5 LinkedIn Parser assertions passed!');
}

await runParseTest();
