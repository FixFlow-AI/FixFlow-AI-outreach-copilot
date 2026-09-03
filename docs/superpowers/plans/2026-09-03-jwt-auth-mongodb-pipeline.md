# JWT Authentication & MongoDB Outreach Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement 1-week JWT authentication with restricted credentials (`suvam`, `arijit`, `ritesh`), MongoDB persistence for outreach pipeline and generation history with team attribution, concise humanized pain-point AI outreach generation, and a sleek FixFlow-themed login and collaborative UI.

**Architecture:** Vercel-compatible modular serverless handlers in `/api` powered by cached MongoDB connection pooling (`api/lib/db.js`), JWT authentication middleware (`api/lib/auth.js`), an Express runner (`server.js`) for local execution, and a glassmorphic dark FixFlow UI in `index.html` with real-time DB synchronization and member attribution.

**Tech Stack:** Node.js, Express, MongoDB (Atlas Driver), JSONWebToken (jsonwebtoken), bcryptjs, dotenv, Google Gemini API, HTML/Vanilla CSS/JavaScript.

**Spec:** [docs/superpowers/specs/2026-09-03-jwt-auth-mongodb-pipeline-design.md](file:///c:/Users/suvam/Desktop/All%20desktop%20items/FixFlow%20AI%20Company/Projects/Productivity%20Tools/FixFlow%20AI%20outreach%20copilot/docs/superpowers/specs/2026-09-03-jwt-auth-mongodb-pipeline-design.md)

## Global Constraints
- Token expiration strictly set to 7 days (`expiresIn: '7d'`).
- Authorized usernames strictly: `suvam`, `arijit`, `ritesh`.
- Passwords must be hashed using `bcryptjs` with salt rounds 10.
- MongoDB connection string sourced from `DB_CONNECTION_URL` in `.env`.
- `JWT_SECRET` sourced from `.env`.
- Gemini API outreach prompt must be engineer-to-engineer, zero corporate jargon, focusing on freelancing pain points and FixFlow solution.
- Connection note hard limit under 250 characters.

---

### Task 1: Project Scaffolding & MongoDB Connection with Auto-Seeding

**Files:**
- Create: `package.json`
- Create: `api/lib/db.js`
- Create: `test/db.test.js`

**Interfaces:**
- Produces: `getDb()`: returns active MongoDB database instance (`fixflow_outreach`).
- Produces: `seedDefaultUsers(db)`: checks and seeds bcrypt-hashed credentials for `suvam`, `arijit`, and `ritesh`.

- [ ] **Step 1: Create package.json with required dependencies**
Define `"type": "module"`, scripts (`"start": "node server.js"`, `"test": "node test/runner.js"`), and dependencies: `mongodb`, `jsonwebtoken`, `bcryptjs`, `dotenv`, `express`, `cors`.

- [ ] **Step 2: Install dependencies**
Run: `npm install`
Expected: Dependencies installed and `node_modules` created.

- [ ] **Step 3: Write failing database connection & seed test in test/db.test.js**
Test connecting to MongoDB and verifying that `users` collection contains the seeded users (`suvam`, `arijit`, `ritesh`) with non-empty `passwordHash`.

- [ ] **Step 4: Implement api/lib/db.js**
Implement cached `MongoClient` instance, database getter, and `seedDefaultUsers` function that hashes the passwords from `.env` using `bcryptjs.hash(password, 10)`.

- [ ] **Step 5: Run database test and verify pass**
Run: `node test/db.test.js`
Expected: Connects to MongoDB Atlas, verifies/seeds users, exits 0.

- [ ] **Step 6: Commit Task 1**
```bash
git add package.json package-lock.json api/lib/db.js test/db.test.js
git commit -m "feat(db): setup mongodb connection pooling and user auto-seeding"
```

---

### Task 2: JWT Authentication Middleware & Auth Endpoints

**Files:**
- Create: `api/lib/auth.js`
- Create: `api/auth.js`
- Create: `test/auth.test.js`

**Interfaces:**
- Consumes: `getDb()` from `api/lib/db.js`.
- Produces: `verifyAuth(req, res)`: middleware checking `Authorization: Bearer <token>`, decoding `{ username, displayName }`.
- Produces: `signToken(payload)`: signs JWT with `expiresIn: '7d'`.
- Produces: `POST /api/auth`: Login endpoint returning `{ token, user }`.
- Produces: `GET /api/auth`: Returns `{ user }` if token is valid.

- [ ] **Step 1: Write test in test/auth.test.js**
Tests:
1. `POST /api/auth` with invalid credentials returns 401.
2. `POST /api/auth` with valid credentials (`suvam` / `Suvam@cto143`) returns token with 7-day expiration and user object.
3. `GET /api/auth` with Bearer token returns 200 and user profile.
4. `verifyAuth` rejects malformed or missing token with 401.

- [ ] **Step 2: Run test to verify it fails**
Run: `node test/auth.test.js`
Expected: FAIL (modules not found / unimplemented).

- [ ] **Step 3: Implement api/lib/auth.js**
Export `signToken`, `verifyToken`, and `authMiddleware` using `jsonwebtoken` and `JWT_SECRET`.

- [ ] **Step 4: Implement api/auth.js**
Handle `POST` (login) and `GET` (verify session) requests.

- [ ] **Step 5: Run test to verify it passes**
Run: `node test/auth.test.js`
Expected: PASS all auth tests.

- [ ] **Step 6: Commit Task 2**
```bash
git add api/lib/auth.js api/auth.js test/auth.test.js
git commit -m "feat(auth): implement 7-day JWT auth and login endpoint"
```

---

### Task 3: Pipeline Leads CRUD with Team Member Attribution

**Files:**
- Create: `api/leads.js`
- Create: `test/leads.test.js`

**Interfaces:**
- Consumes: `getDb()` from `api/lib/db.js`, `authMiddleware` from `api/lib/auth.js`.
- Produces:
  - `GET /api/leads`: returns all leads sorted by `updatedAt: -1`.
  - `POST /api/leads`: creates lead with `createdBy: username`, `lastUpdatedBy: username`.
  - `PATCH /api/leads`: updates status/notes, sets `lastUpdatedBy: username`, `updatedAt: Date`.
  - `DELETE /api/leads`: deletes lead by `id`.

- [ ] **Step 1: Write test in test/leads.test.js**
Tests:
1. Unauthorized request to `/api/leads` returns 401.
2. Authenticated `POST /api/leads` creates lead with `createdBy: 'suvam'`.
3. Authenticated `GET /api/leads` returns the created lead.
4. Authenticated `PATCH /api/leads` with a different user (`arijit`) updates status to `'Interested'` and sets `lastUpdatedBy: 'arijit'`.
5. Authenticated `DELETE /api/leads` deletes the lead.

- [ ] **Step 2: Run test to verify it fails**
Run: `node test/leads.test.js`
Expected: FAIL.

- [ ] **Step 3: Implement api/leads.js**
Implement handler for `GET`, `POST`, `PATCH`, `DELETE` operations on MongoDB `leads` collection.

- [ ] **Step 4: Run test to verify it passes**
Run: `node test/leads.test.js`
Expected: PASS all lead CRUD and attribution tests.

- [ ] **Step 5: Commit Task 3**
```bash
git add api/leads.js test/leads.test.js
git commit -m "feat(leads): implement collaborative pipeline CRUD with user attribution"
```

---

### Task 4: AI Generation Logs & Refined Developer Outreach Prompt

**Files:**
- Create: `api/history.js`
- Modify: `api/generate.js`
- Create: `test/generate.test.js`

**Interfaces:**
- Consumes: `authMiddleware` from `api/lib/auth.js`, `getDb()` from `api/lib/db.js`.
- Produces:
  - `GET /api/history`: returns team draft history.
  - `POST /api/history`: logs generated draft with `generatedBy: username`.
  - `DELETE /api/history`: deletes draft by `id` or all.
  - `POST /api/generate`: protected endpoint generating humanized outreach addressing dev pain points & FixFlow solution.

- [ ] **Step 1: Write test in test/generate.test.js**
Test that `/api/generate` rejects unauthenticated requests with 401, and test `/api/history` CRUD.

- [ ] **Step 2: Implement api/history.js**
Create handler for `GET`, `POST`, `DELETE` on `history` collection.

- [ ] **Step 3: Refine api/generate.js**
Add `authMiddleware` check, update system prompt to emphasize developer freelancing pain points (bidding noise, unpaid milestone friction, code quality invisible on resumes) and FixFlow solutions (GitHub-verified repo skills, escrow milestones) with humanized zero-hype peer tone.

- [ ] **Step 4: Run tests to verify**
Run: `node test/generate.test.js`
Expected: PASS.

- [ ] **Step 5: Commit Task 4**
```bash
git add api/history.js api/generate.js test/generate.test.js
git commit -m "feat(ai): protect generate endpoint and persist draft history"
```

---

### Task 5: LinkedIn Profile Link Parsing Endpoint

**Files:**
- Create: `api/parse-profile.js`
- Create: `test/parse.test.js`

**Interfaces:**
- Produces: `POST /api/parse-profile`: accepts `{ url }`, parses slug name (e.g. `linkedin.com/in/john-doe` -> `John Doe`), attempts OpenGraph metadata fetch, gracefully falls back if LinkedIn auth wall is detected.

- [ ] **Step 1: Write test in test/parse.test.js**
Tests slug extraction and fallback response formatting.

- [ ] **Step 2: Implement api/parse-profile.js**
Extract name from standard LinkedIn URLs, attempt lightweight fetch for meta tags, return `{ name, headline, rawUrl }`.

- [ ] **Step 3: Run test and verify pass**
Run: `node test/parse.test.js`
Expected: PASS.

- [ ] **Step 4: Commit Task 5**
```bash
git add api/parse-profile.js test/parse.test.js
git commit -m "feat(parser): add linkedin profile url parser with auth-wall fallback"
```

---

### Task 6: Local Express Development Runner

**Files:**
- Create: `server.js`

**Interfaces:**
- Serves static files (`index.html`) on root `/`.
- Maps `/api/auth`, `/api/leads`, `/api/history`, `/api/generate`, `/api/parse-profile` to the corresponding handlers.
- Auto-loads `.env` and initializes DB connection and user seeding.

- [ ] **Step 1: Implement server.js**
Use `express`, `cors`, `dotenv/config`, setup routes and adapter for serverless handler signatures (`(req, res)`).

- [ ] **Step 2: Test starting server.js and hitting health/auth endpoints**
Run quick test to verify `http://localhost:3000` responds.

- [ ] **Step 3: Commit Task 6**
```bash
git add server.js
git commit -m "feat(server): add local express server runner for development"
```

---

### Task 7: Frontend UI Implementation & MongoDB Real-Time Sync

**Files:**
- Modify: `index.html`

**Interfaces:**
- Renders:
  - FixFlow glassmorphic Login Modal when not authenticated.
  - Authenticated top bar with active user pill (e.g. `● suvam`), DB sync indicator, and Logout button.
  - Dedicated LinkedIn Profile URL input with "Auto-fill" button.
  - Collaborative pipeline lead cards with `added by @username` and `updated by @username`.
  - Pipeline team filter dropdown: `All Team Leads`, `My Leads`, `@suvam`, `@arijit`, `@ritesh`.
  - Direct sync to MongoDB API endpoints with local caching.

- [ ] **Step 1: Add Login Modal & Header Elements to index.html**
Insert login modal HTML/CSS matching FixFlow design system (`--bg: #0F131A`, `--accent: #2DD4BF`, Space Grotesk/Inter fonts). Add user badge and sync indicator to header.

- [ ] **Step 2: Add LinkedIn URL field and Auto-fill button in Draft form**
Place LinkedIn URL input as the first field with "Auto-fill" button, link to pipeline cards.

- [ ] **Step 3: Integrate JavaScript Auth & MongoDB API Sync**
Update JavaScript to manage `fixflow_token` in `localStorage`, send `Authorization: Bearer <token>` in all requests, load pipeline and history from `/api/leads` and `/api/history`, and patch updates directly to MongoDB.

- [ ] **Step 4: Verify Full User Workflow via Browser Subagent / HTTP**
Test login with `suvam` / `Suvam@cto143`, generate draft, save to pipeline, verify lead in MongoDB, log out, log in with `arijit` / `Arijit@ceo997`, verify lead is visible with `added by @suvam`, change status to `Interested`, verify `updated by @arijit`.

- [ ] **Step 5: Commit Task 7**
```bash
git add index.html
git commit -m "feat(ui): integrate login modal, collaborative pipeline, and mongodb sync"
```
