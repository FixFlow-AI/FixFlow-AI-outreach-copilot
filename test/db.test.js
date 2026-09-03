import assert from 'assert';
import bcrypt from 'bcryptjs';
import { getDb, closeDb, DEFAULT_USERS } from '../api/lib/db.js';

async function runDbTest() {
  console.log('--- Running Task 1 Test: MongoDB Connection & User Seeding ---');
  try {
    const db = await getDb();
    assert(db, 'Failed to obtain db instance');
    console.log('✓ Connected to MongoDB Atlas successfully');

    const usersCol = db.collection('users');
    const users = await usersCol.find({}).toArray();
    console.log(`✓ Found ${users.length} users in database`);

    for (const expectedUser of DEFAULT_USERS) {
      const user = await usersCol.findOne({ username: expectedUser.username.toLowerCase() });
      assert(user, `User ${expectedUser.username} was not found in users collection`);
      assert(user.passwordHash, `User ${expectedUser.username} has no passwordHash`);
      
      const isMatch = await bcrypt.compare(expectedUser.password, user.passwordHash);
      assert(isMatch, `Password hash mismatch for user ${expectedUser.username}`);
      console.log(`✓ Verified user '${user.username}' (${user.displayName}) with valid hashed password`);
    }

    console.log('All Task 1 database assertions passed!');
  } finally {
    await closeDb();
  }
}

runDbTest().then(() => {
  process.exit(0);
}).catch((err) => {
  console.error('Task 1 Test failed:', err);
  process.exit(1);
});
