# Technical Design: JWT Authentication & MongoDB Outreach Pipeline

**Date**: 2026-09-03  
**Status**: Approved by user, ready for implementation plan  
**Target System**: FixFlow AI Outreach Copilot  

---

## 1. Executive Summary
This design document defines the architectural transformation of the FixFlow AI Outreach Copilot from a single-user `localStorage`-only client app into a secure, multi-user collaborative platform. It introduces JWT-based authentication (valid for 1 week / 7 days) with access restricted to authorized team credentials, persistent cloud storage on MongoDB Atlas (`DB_CONNECTION_URL`), shared team pipeline tracking with user attribution, LinkedIn profile input with auto-extraction capabilities, and concise humanized AI outreach prompts addressing developer freelancing pain points.

---

## 2. Authentication & Access Control Architecture

### 2.1 Authorized User Whitelist
Access is restricted to pre-authorized team members provided in `.env`:
* `suvam`: Suvam (CTO)
* `arijit`: Arijit (CEO)
* `ritesh`: Ritesh (FixFlow AI)

### 2.2 Password Security & Auto-Seeding
* Passwords are never stored in plain text.
* On MongoDB connection startup, the system checks if the authorized users exist in the `users` collection.
* If any user is missing, their password is encrypted using `bcrypt` (salt rounds = 10) and stored in MongoDB.

### 2.3 JWT Token Specification
* **Algorithm**: HS256
* **Secret**: `JWT_SECRET` loaded from `.env`
* **Validity Period**: `7d` (1 week)
* **Payload**:
  ```json
  {
    "username": "suvam",
    "displayName": "Suvam",
    "role": "team"
  }
  ```
* **Transmission**: Stored securely in client `localStorage` under `fixflow_token` and passed via standard HTTP header:
  ```http
  Authorization: Bearer <token>
  ```
* **Verification Middleware**: `api/lib/auth.js` verifies the token on all protected routes (`/api/leads`, `/api/history`, `/api/generate`). Rejects expired or invalid tokens with HTTP 401.

---

## 3. Database Architecture (MongoDB Atlas)

The system connects to MongoDB using `DB_CONNECTION_URL` with cached connection pooling in `api/lib/db.js` to ensure stability across both serverless environments and local runners.

### Database Name
`fixflow_outreach` (or default specified in connection string).

### Collections

#### 1. `users`
```typescript
interface User {
  _id: ObjectId;
  username: string;        // unique index, lowercase ("suvam", "arijit", "ritesh")
  passwordHash: string;    // bcrypt hash
  displayName: string;     // e.g. "Suvam"
  role: string;            // "admin" | "member"
  createdAt: Date;
  lastLogin?: Date;
}
```

#### 2. `leads` (Collaborative Pipeline)
```typescript
interface Lead {
  _id: ObjectId;
  id: string;              // Client UUID / unique identifier
  linkedinUrl?: string;    // Direct link to lead profile
  name: string;
  headline: string;
  stack: string;
  context: string;
  note: string;            // Generated connection note (<250 chars)
  dm: string;              // Generated 3-paragraph DM
  status: string;          // 'Contacted' | 'Interested' | 'Signed Up' | 'Verified Profile' | 'Value Experienced' | 'Retained' | 'No Response' | 'Not Interested'
  notes: string;           // Internal follow-up notes
  createdBy: string;       // username of author
  lastUpdatedBy: string;   // username who last changed status or notes
  createdAt: Date;
  updatedAt: Date;
}
```

#### 3. `history` (AI Generation Logs)
```typescript
interface GenerationHistory {
  _id: ObjectId;
  id: string;
  linkedinUrl?: string;
  name: string;
  headline: string;
  stack: string;
  context: string;
  connected: boolean;
  note: string;
  dm: string;
  savedToPipeline: boolean;
  generatedBy: string;     // username
  generatedAt: Date;
}
```

---

## 4. API Endpoints Specification

### 4.1 `/api/auth`
* `POST /api/auth`: Login endpoint. Accepts `{ username, password }`. Compares bcrypt hash. Returns `{ token, user: { username, displayName } }`.
* `GET /api/auth`: Token verification. Validates existing JWT and returns user details.

### 4.2 `/api/leads`
* `GET /api/leads`: Protected. Returns all leads sorted by `updatedAt: -1`.
* `POST /api/leads`: Protected. Inserts lead with `createdBy: user.username`, `lastUpdatedBy: user.username`.
* `PATCH /api/leads`: Protected. Accepts `{ id, status, notes }`. Updates `lastUpdatedBy: user.username` and `updatedAt: new Date()`.
* `DELETE /api/leads`: Protected. Deletes lead by `id`.

### 4.3 `/api/history`
* `GET /api/history`: Protected. Returns generation logs.
* `POST /api/history`: Protected. Saves generated draft with `generatedBy: user.username`.
* `DELETE /api/history`: Protected. Deletes single history item or clears team history.

### 4.4 `/api/parse-profile`
* `POST /api/parse-profile`: Accepts `{ url }`. Attempts to parse name and headline from URL slug and public OpenGraph metadata. If blocked by LinkedIn auth wall, returns extracted slug name and prompts for quick manual paste.

### 4.5 `/api/generate`
* `POST /api/generate`: Protected with JWT auth. Runs Gemini model (`gemini-3.5-flash-lite` or current active Gemini endpoint) using `GEMINI_API_KEY`.

---

## 5. AI Messaging & Prompt Engineering

The system prompt enforces authentic, concise, developer-to-developer messaging:
* **Strict Anti-Sales Filter**: Banned phrases: *"game changer"*, *"revolutionary"*, *"seamless"*, *"10x"*, *"synergy"*, sales pitches.
* **Pain Points Targeted**:
  1. Unpaid milestones, client payment delays, scope creep, and client ghosting.
  2. Race-to-the-bottom bidding wars on freelance platforms against fake or exaggerated resumes.
  3. Real code architecture and backend depth being invisible on standard PDF resumes.
* **FixFlow Solution Positioning**:
  - GitHub-verified repository skills profiles.
  - Escrow-protected milestone payouts.
* **Message Outputs**:
  - **Connection Note**: Hard limit under 250 characters. Friendly greeting, specific hook, zero pitch.
  - **DM Message**: 3 brief, scannable paragraphs:
    - Paragraph 1: Friendly personal hook referencing their specific stack or project.
    - Paragraph 2: Relatable developer freelancing pain point and how FixFlow solves it.
    - Paragraph 3: Low-pressure invitation to check out fixflowai.xyz and claim their verified profile.

---

## 6. Frontend UI/UX Architecture

1. **Authentication Gate**:
   - If not logged in, render a dark FixFlow glassmorphism login modal.
   - Blocks UI until authenticated with valid credentials.
2. **Authenticated Top Bar**:
   - Displays user badge (e.g. `● suvam (CTO)`).
   - Live DB sync status: `● Synced to MongoDB` (flashes subtle spinner when saving).
   - "Logout" button.
3. **LinkedIn Profile Input**:
   - First input in the Draft tab with an "Extract" button.
   - Persisted to pipeline lead cards with a one-click "Open LinkedIn" external link.
4. **Collaborative Pipeline View**:
   - Shows attribution badges: `added by @suvam · Sep 3` and `updated by @arijit · 2m ago`.
   - Filter dropdown: `All Team Leads`, `My Leads`, `@suvam`, `@arijit`, `@ritesh`.
   - Real-time debounced patching to MongoDB when updating stage or typing follow-up notes.

---

## 7. Execution & Local Runner
* Create a root `package.json` with dependencies: `express`, `mongodb`, `jsonwebtoken`, `bcryptjs`, `dotenv`, `cors`.
* Implement `server.js` allowing instant local development via `node server.js` or `npm start` on `http://localhost:3000`.
* Keep modular handlers in `/api` so it deploys out-of-the-box on Vercel or Render.

---

## 8. Verification & Test Plan
1. **Auth Verification**:
   - Test login with valid credentials (`suvam` / `Suvam@cto143`). Verify 7-day JWT issue.
   - Test invalid credentials. Verify rejection.
   - Test protected endpoint without token or with expired token. Verify 401 error.
2. **Database Verification**:
   - Test MongoDB Atlas connection and auto-seeding of users.
   - Test saving a lead to the pipeline and verify record in MongoDB Atlas.
   - Test updating stage and notes and verify `lastUpdatedBy` and `updatedAt` tracking.
3. **AI Generation Verification**:
   - Run draft generation with authenticated token.
   - Verify connection note is <250 characters and DM accurately highlights developer pain points and FixFlow solution without sales hype.
4. **End-to-End UI Verification**:
   - Test login, drafting, saving to pipeline, logging out, logging in as another user (`arijit`), and verifying shared pipeline visibility with correct author attribution.
