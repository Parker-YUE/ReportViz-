# Report Modes and Secure 10MB Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a default standard report mode, an opt-in five-dimension scored mode, secure direct uploads up to 10MB, and a persistent WeChat contact line.

**Architecture:** Keep the existing parse endpoint and result renderer, but add explicit mode validation and a scored-mode prompt/validator. Large files use an authenticated upload-ticket endpoint that creates a single-path Supabase signed upload URL; `/api/parse` verifies a short-lived JWT ticket, downloads and validates the private object, and writes the record using the pre-generated UUID.

**Tech Stack:** Node.js CommonJS, Vercel Functions, Supabase Storage, `jsonwebtoken`, vanilla HTML/CSS/JavaScript, Node `assert` tests.

**Spec:** `docs/superpowers/specs/2026-09-17-report-mode-and-direct-upload-design.md`

## Global Constraints

- Report mode defaults to `standard`; only `standard` and `scored` are valid.
- Scored output contains one `radar_score` with exactly five named dimensions, numeric scores, and non-empty evidence descriptions.
- Source dimensions take priority; AI-transform fixed dimensions are fallback only when the source has none.
- New browser uploads accept PDF, DOCX, and TXT up to exactly 10MB; legacy Base64 remains capped at 3MB.
- The Supabase `attachments` bucket remains private and never exposes the service key.
- Upload tickets bind invitation code, storage path, record ID, filename, declared size, and MIME type.
- No database schema or new environment variable is introduced.
- Contact copy is exactly `咨询及合作｜微信：allen20255`.

---

### Task 1: Report-mode domain rules

**Files:**
- Modify: `lib/result-sanitizer.js`
- Modify: `tests/result-sanitizer.test.js`

**Interfaces:**
- Produces: `normalizeReportMode(value) -> 'standard' | 'scored'`
- Produces: `assertScoredResult(data, reportMode) -> data` or throws `{ code: 'INVALID_SCORED_RESULT' }`
- Extends: `sanitizeResult(data, { reportMode, inputText, filename, previousScore })`

- [ ] **Step 1: Add failing tests for mode normalization and scored-result validation**

```js
assert.strictEqual(normalizeReportMode(), 'standard');
assert.strictEqual(normalizeReportMode('scored'), 'scored');
assert.throws(() => normalizeReportMode('bad'), e => e.code === 'INVALID_REPORT_MODE');
assert.throws(() => assertScoredResult({ sections: [] }, 'scored'), e => e.code === 'INVALID_SCORED_RESULT');
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node tests/result-sanitizer.test.js`

Expected: assertions fail because the mode helpers or scored validation do not yet exist.

- [ ] **Step 3: Implement normalization, scored validation, and source-dimension priority**

```js
function normalizeReportMode(value) {
  if (value == null || value === '') return 'standard';
  if (value === 'standard' || value === 'scored') return value;
  throw codedError(400, 'INVALID_REPORT_MODE', '报告版本无效');
}

function assertScoredResult(data, reportMode) {
  if (reportMode !== 'scored') return data;
  const radar = data.sections?.find(section => section.type === 'radar_score');
  const valid = radar
    && Number.isFinite(Number(radar.total_score))
    && radar.dimensions?.length === 5
    && radar.dimensions.every(d => String(d.name || '').trim()
      && Number.isFinite(Number(d.score))
      && String(d.description || '').trim());
  if (!valid) throw codedError(502, 'INVALID_SCORED_RESULT', '五维评分结构不完整');
  return data;
}
```

- [ ] **Step 4: Run focused and full tests**

Run: `node tests/result-sanitizer.test.js`

Expected: all sanitizer tests pass, including full-source, partial-source, and fixed-fallback cases.

- [ ] **Step 5: Commit task files**

```bash
git add lib/result-sanitizer.js tests/result-sanitizer.test.js
git commit -m "feat: add scored report mode rules"
```

### Task 2: Scored-mode prompt and parse contract

**Files:**
- Create: `prompts/scored-mode.txt`
- Create: `lib/prompt-builder.js`
- Create: `tests/prompt-builder.test.js`
- Modify: `api/parse.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `normalizeReportMode`, `assertScoredResult`, `sanitizeResult`
- Produces: `buildSystemPrompt(basePrompt, reportMode, scoredPrompt) -> string`
- API consumes: `report_mode?: 'standard' | 'scored'`
- API returns: `report_mode` in saved and returned result JSON.

- [ ] **Step 1: Write a failing prompt-builder test**

```js
assert.strictEqual(buildSystemPrompt('BASE', 'standard', 'SCORED'), 'BASE');
assert.strictEqual(buildSystemPrompt('BASE', 'scored', 'SCORED'), 'BASE\n\nSCORED');
```

- [ ] **Step 2: Run the test and verify RED**

Run: `node tests/prompt-builder.test.js`

Expected: FAIL because `buildSystemPrompt` is missing.

- [ ] **Step 3: Implement the prompt builder and scored prompt**

The scored prompt requires exactly five dimensions, source-first priority, non-empty evidence, and AI-transform fallback only when the source has no dimensions.

- [ ] **Step 4: Wire mode into `/api/parse`**

Normalize `req.body.report_mode` before input parsing. Append the scored prompt only for `scored`, pass `reportMode` into `sanitizeResult`, set `data.report_mode`, then call `assertScoredResult`. Map `INVALID_SCORED_RESULT` to `AI 未生成完整的五维评分，请重新生成` with the existing request ID.

- [ ] **Step 5: Run prompt, sanitizer, and API syntax checks**

Run: `node tests/prompt-builder.test.js`

Run: `npm test`

Run: `node --check api/parse.js`

- [ ] **Step 6: Commit task files**

```bash
git add prompts/scored-mode.txt lib/prompt-builder.js tests/prompt-builder.test.js api/parse.js package.json
git commit -m "feat: enforce scored report parse contract"
```

### Task 3: Upload-ticket and 10MB file-security primitives

**Files:**
- Modify: `lib/jwt.js`
- Modify: `lib/upload-validation.js`
- Modify: `tests/upload-validation.test.js`
- Create: `tests/upload-ticket.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `DIRECT_UPLOAD_MAX_BYTES = 10 * 1024 * 1024`
- Produces: `validateUploadMetadata({ filename, size, mimeType }) -> { filename, ext, size, mimeType }`
- Produces: `validateStoredFile(buffer, filename, declaredSize) -> { ext }`
- Produces: `createUploadTicket(payload) -> JWT string`
- Produces: `verifyUploadTicket(token, invitationCode) -> payload | null`

- [ ] **Step 1: Add failing metadata, magic-byte, and ticket-binding tests**

Test exact 10MB acceptance, 10MB+1 rejection, PDF `%PDF`, DOCX `PK`, binary TXT rejection, expired/invalid ticket rejection, and invitation-code mismatch rejection.

- [ ] **Step 2: Run both tests and verify RED**

Run: `node tests/upload-validation.test.js`

Run: `node tests/upload-ticket.test.js`

- [ ] **Step 3: Implement validation and upload-ticket JWT helpers**

Use the existing `JWT_SECRET`. Upload tickets use `{ type: 'upload', code, recordId, path, filename, size, mimeType }` and expire in 15 minutes.

- [ ] **Step 4: Run focused and full tests**

Run: `node tests/upload-validation.test.js`

Run: `node tests/upload-ticket.test.js`

Run: `npm test`

- [ ] **Step 5: Commit task files**

```bash
git add lib/jwt.js lib/upload-validation.js tests/upload-validation.test.js tests/upload-ticket.test.js package.json
git commit -m "feat: validate secure direct uploads"
```

### Task 4: Signed-upload endpoint and Storage operations

**Files:**
- Create: `api/upload-ticket.js`
- Modify: `lib/storage.js`
- Create: `tests/storage-path.test.js`
- Modify: `package.json`

**Interfaces:**
- Consumes: `requireUserToken`, `validateUploadMetadata`, `createUploadTicket`
- Produces: `buildInputPath(recordId) -> '<uuid>/input'`
- Produces: `createInputUploadUrl(recordId) -> { signedUrl, path }`
- Produces: `downloadInput(path) -> Buffer`
- Produces: `removeInput(path) -> void`
- Endpoint returns: `{ signed_url, upload_ticket }`

- [ ] **Step 1: Write failing path tests**

```js
assert.strictEqual(buildInputPath('8fc5e16b-7ef8-460d-a2c8-6d0fd3ecbf92'), '8fc5e16b-7ef8-460d-a2c8-6d0fd3ecbf92/input');
assert.throws(() => buildInputPath('../escape'));
```

- [ ] **Step 2: Run and verify RED**

Run: `node tests/storage-path.test.js`

- [ ] **Step 3: Implement path and Storage helpers**

Use `getDB().storage.from('attachments').createSignedUploadUrl(path)`, `.download(path)`, and `.remove([path])`. Never return or log the service key or raw upload token separately.

- [ ] **Step 4: Implement `/api/upload-ticket`**

Require POST and user auth, validate metadata, generate `crypto.randomUUID()`, create the signed URL, sign the 15-minute ticket, and return only `signed_url` and `upload_ticket`. Add structured request-ID logs without sensitive values.

- [ ] **Step 5: Run full tests and syntax checks**

Run: `npm test`

Run: `node --check api/upload-ticket.js`

- [ ] **Step 6: Commit task files**

```bash
git add api/upload-ticket.js lib/storage.js tests/storage-path.test.js package.json
git commit -m "feat: issue private signed upload tickets"
```

### Task 5: Parse direct-uploaded files and clean failures

**Files:**
- Modify: `api/parse.js`
- Modify: `lib/storage.js`
- Modify: `tests/upload-ticket.test.js`

**Interfaces:**
- Consumes request: `{ upload_ticket, report_mode }`
- Consumes: `verifyUploadTicket`, `downloadInput`, `validateStoredFile`, `removeInput`
- Retains legacy request: `{ file_base64, filename, report_mode }` with 3MB cap.

- [ ] **Step 1: Add failing ticket-flow tests for same-code and cross-code behavior**

Use real ticket helpers; assert the correct invitation code succeeds and a different invitation code fails before any storage read can occur.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/upload-ticket.test.js`

- [ ] **Step 3: Add direct-upload branch to `/api/parse`**

Verify ticket first, download the private object, validate actual bytes and file signature, parse it, and insert the record with `id: ticket.recordId`. On any pre-insert or AI failure, invoke best-effort `removeInput(ticket.path)` without masking the original error. Successful records retain `{recordId}/input` for the existing attachment endpoint.

- [ ] **Step 4: Run full tests and syntax checks**

Run: `npm test`

Run: `node --check api/parse.js`

- [ ] **Step 5: Commit task files**

```bash
git add api/parse.js lib/storage.js tests/upload-ticket.test.js
git commit -m "feat: parse direct uploaded report files"
```

### Task 6: Frontend modes, direct upload, and contact copy

**Files:**
- Create: `public/report-options.js`
- Create: `tests/report-options.test.js`
- Modify: `public/index.html`
- Modify: `package.json`

**Interfaces:**
- Produces: `ReportVizOptions.buildParsePayload(reportMode, input)`
- Produces: `ReportVizOptions.buildUploadMetadata(file)`
- Browser calls: `/api/upload-ticket`, then `PUT signed_url`, then `/api/parse` with `upload_ticket`.

- [ ] **Step 1: Write failing browser-helper tests**

Test default mode `standard`, scored payload propagation, 10MB acceptance, 10MB+1 rejection, and filename/type metadata output.

- [ ] **Step 2: Run and verify RED**

Run: `node tests/report-options.test.js`

- [ ] **Step 3: Implement `public/report-options.js`**

Use a UMD wrapper like `public/safe-html.js` so the same real functions run in Node tests and the browser.

- [ ] **Step 4: Add the two mode cards and exact explanatory copy**

Default the DOM selection to ordinary mode. Add the scored-mode note verbatim from the spec. Pass `report_mode` for text and file flows.

- [ ] **Step 5: Replace new-page file Base64 with signed direct upload**

Show upload progress using `XMLHttpRequest` against `signed_url`, then call `/api/parse` with `upload_ticket`. Keep the loading UI recoverable on upload, ticket, and parse failures.

- [ ] **Step 6: Add global contact text**

Place `咨询及合作｜微信：allen20255` in the top navigation with mobile wrapping and no overlap.

- [ ] **Step 7: Run helper tests and compile every inline script**

Run: `node tests/report-options.test.js`

Run: `npm test`

Compile `public/index.html`, `public/admin.html`, and `public/admin-records.html` inline scripts with `vm.Script`.

- [ ] **Step 8: Commit task files**

```bash
git add public/report-options.js public/index.html tests/report-options.test.js package.json
git commit -m "feat: add report modes and 10mb direct upload UI"
```

### Task 7: Documentation, local verification, and deployment handoff

**Files:**
- Modify: `项目文档/02-项目功能.md`
- Modify: `项目文档/03-代码地图.md`
- Modify: `项目文档/05-当前待解决问题.md`
- Modify: `项目文档/06-部署与配置.md`

**Interfaces:**
- Documents the final user flow, security boundary, 10MB limit, scored rules, and authorized bucket configuration.

- [ ] **Step 1: Update project documentation**

Record that new UI uses direct upload, legacy Base64 stays at 3MB, no schema/env change is required, and the bucket configuration is private/10MB/MIME-restricted.

- [ ] **Step 2: Run full verification**

Run: `npm test`

Run: `node --check api/parse.js`

Run: `node --check api/upload-ticket.js`

Run: `npm audit --audit-level=high`

Run: `git diff --check`

- [ ] **Step 3: Run local Vercel and browser verification**

Verify login renders, contact is visible, ordinary mode is selected, scored note is visible after selection, a small file uploads directly, and an 11MB file is rejected before upload.

- [ ] **Step 4: Inspect the authorized Storage bucket configuration without printing secrets**

Confirm private status, 10MB limit, and allowed MIME types. Apply the authorized configuration only after code verification succeeds.

- [ ] **Step 5: Commit documentation and present deployment gate**

Do not deploy or push without a separate explicit user confirmation. Report local verification evidence, the Storage configuration result, and request production deployment approval.
