# SafeBite PWA — Plan 4: Shortlist, visited state and notes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the household shortlist and visited state (`households/{hid}/collection/{rid}`), authored notes on restaurant records (`restaurants/{rid}/notes/{nid}`), a rules-enforced deletion completion gate that no client version can bypass, per-tab reset on any account change, and a change-password form. Everything is proven by rules, web unit and browser tests.

**Architecture:** Same layout as Plans 1–3 (`web/`, `functions/`, root scripts, `firestore.rules`). Rules gain a top-level `callerName()`, a `collection/{rid}` match, a `notes/{nid}` match under restaurants and a `cleanupDone` completion gate on restaurant deletion. `web/src/records/repository.ts` remains the records module and owns the deletion protocol (now read-before-delete). It also exports its transaction and listener helpers to two new sibling modules, `collection.ts` (shortlist/visited) and `notes.ts`. Pure helpers (`combine.ts` for joined read states, `join.ts` for records × state) keep the pages thin. The restaurant page gains `StatusBlock.tsx` and `NotesSection.tsx`. `AuthProvider` resets its document through `resetDocument()` when a previously seen UID signs out or changes. `ChangePasswordForm.tsx` sits in Settings, backed by `auth/changePassword.ts`.

**Tech Stack:** Vite 8.3, React 19, react-router 8, TypeScript 6 strict (web) / 5.9 (functions), Vitest 5, Playwright 1.63 (Chromium only), Firebase JS SDK 12, `@firebase/rules-unit-testing` 5, firebase-tools 15.30, Node 22.

**Spec:** `planning/specs/2026-09-20-safebite-pwa-design.md`. **§3.7 (as amended at f8edfc9 after `planning/audits/2026-09-24-plan-4-design-review.md`) is the binding design for this plan.** It covers rulings 1–5, the data model, the deletion protocol and completion gate, the client, account switch, change password, read states, note confirmation and conflicts, tests, decisions, the deploy note and exclusions. Also binding: §2.1 non-negotiable rules (a note never grants a label or refreshes a checked date), §2.4 security model, §3.5 (read states, online-only transactional writes, deletion protocol this plan extends) and §3.2 guardrails. Previous plans: `planning/plans/2026-09-21-safebite-pwa-02b-records.md` (repository, pages, e2e helpers) and `planning/plans/2026-09-22-safebite-pwa-03-discovery.md`.

## Global Constraints

- Emulators only (`demo-safebite`). No `firebase deploy`, no `git push`, no billing or console changes, no access to the staging project `safebite-pilot-urfs3v`. The string `safebite-production-13ba1` must not appear in new files.
- Working directory is the worktree `/home/godja/Dev/AvaGF/.claude/worktrees/pwa-04-collection` on branch `worktree-pwa-04-collection`. Never run anything in `/home/godja/Dev/AvaGF` itself.
- Every Firestore write from `web/` goes through `runTransaction` via the repository's `write()` helper (online pre-check, typed `WriteOutcome`, never throws). No `setDoc`/`updateDoc`/`deleteDoc`/`writeBatch` in `web/src`. Never `window.confirm`/`alert`/`prompt` in `web/src`.
- No numerical safety score. Notes and collection documents carry nothing a safety label could be derived from. No write touches a claim except the existing claim functions.
- `LIMITS.note` = 2000 characters. The client password minimum is 8 characters (client rule only). Visit dates are UTC-midnight timestamps read as calendar days (`dates.ts`), never later than the device's local today on the client, `<= request.time + 1 day` in rules.
- British spelling in UI copy. The testids of existing screens stay unchanged unless a step says otherwise.
- The browser Firestore SDK keeps offline persistence off (memory cache). No new `localStorage`/`sessionStorage`/IndexedDB use in `web/src`.
- Line endings: every file this plan touches is LF. Edit with tools that preserve endings.
- Node 22; TS strict. Commit messages end with `Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>`. Implementers may see a different attribution reminder; use this line.
- Emulator-backed runs (`npm run emu:test`, `npm run emu:e2e`) take one to three minutes here, so give those shell commands a 10 minute timeout.
- Every task ends with `npm run typecheck` and `npm run test:unit` green. Add `npm run emu:test` when the task touched `functions/` or `firestore.rules`, and `npm run emu:e2e` when it touched `web/e2e`, rules or anything the browser suite exercises. State unit counts as "previous + N new". Do not assert absolute totals in commit messages. Baseline at `f8edfc9`: web unit 270, functions + rules 282, browser 29.

---

## File map

| Path | Responsibility |
|------|----------------|
| `firestore.rules` | `callerName()`; restaurant `cleanupDone` + `isMarkingCleanupDone()` + delete gate; `collection/{rid}`; `restaurants/{rid}/notes/{nid}` |
| `functions/test/rules.collection.test.ts` (new) | Rules tests for collection state and notes |
| `functions/test/rules.records.test.ts` | Restaurant create/update/delete cases for `cleanupDone` and the gate |
| `functions/test/rules.deletion.test.ts` (new) | Mixed-version and concurrent deletion protocol against the rules |
| `web/src/records/types.ts` | `CollectionState`, `Note`, `NoteInput` |
| `web/src/records/validation.ts` (+test) | `LIMITS.note`; `validateNoteText`; `validateVisitedOn` |
| `web/src/records/rulesParity.test.ts` | `LIMITS.note` appears in the rules |
| `web/src/test/memoryFirestore.ts` (new) | In-memory transaction/page fake shared by repository, collection and notes tests |
| `web/src/records/repository.ts` (+test) | Exports helpers; `notesCol`; read-before-delete `sweep`; `sweepNotes`; `removeCollectionState`; `markCleanupDone`; `finishDeleting` extended; `DeleteStep` gains `sweepingNotes` |
| `web/src/records/collection.ts` (+test, new) | `watchCollection`, `watchCollectionEntry`, `setShortlisted`, `setVisited` |
| `web/src/records/notes.ts` (+test, new) | `watchNotes`, `addNote`, `updateNote`, `deleteNote` |
| `web/src/records/combine.ts` (+test, new) | `isData`, `anyOffline`, `combineStates` |
| `web/src/records/join.ts` (+test, new) | `joinRecords`, `filterRows` |
| `web/src/records/messages.ts` (+test, new test) | `statusOutcomeMessage`, `deleteProgressText`, `finishOutcomeText` |
| `web/src/records/RestaurantsPage.tsx` (+test) | Filter, labels, empty states, joined read state, resume wording |
| `web/src/records/StatusBlock.tsx` (+test, new) | Shortlist and visited controls |
| `web/src/records/NotesSection.tsx` (+test, new) | Notes list, composer, edit with conflict chooser, delete with confirmation identity |
| `web/src/records/RestaurantDetailPage.tsx` (+test) | Wires StatusBlock and NotesSection; one offline notice for four listeners |
| `web/src/records/RestaurantFormPage.tsx` (+test) | Deletion confirmation text; delete outcome uses the delete verb; progress text via `deleteProgressText` |
| `web/src/auth/resetDocument.ts` (new) | `resetDocument()` → `window.location.replace("/")` |
| `web/src/auth/AuthProvider.tsx` (+test) | `lastUid`; `resetting` state; reset on null or a different UID |
| `web/src/App.tsx` | Renders the `resetting` state |
| `web/src/auth/changePassword.ts` (+test, new) | `validateNewPassword`, `changePassword`, `CHANGE_PASSWORD_MESSAGES` |
| `web/src/pages/ChangePasswordForm.tsx` (+test, new) | The Settings form |
| `web/src/pages/SettingsPage.tsx` (+test) | Renders `ChangePasswordForm` |
| `web/src/styles.css` | `.labels`, `.label`, `.filter`, `.note` |
| `web/e2e/emulator-rest.ts` | `clearRecords` also removes notes and collection documents; `seedNote`, `seedCollection`, `listNoteIds`, `collectionExists`, `updateNoteViaRest`, `sweepClaimsViaRest` |
| `web/e2e/auth-rest.ts` (new) | `setPasswordViaAdmin` for the Auth emulator |
| `web/e2e/collection.spec.ts` (new) | Shortlist, visited, notes, deletion and conflict scenarios |
| `web/e2e/records.spec.ts` | Two list assertions select *All records* (Task 4) |
| `web/e2e/auth.spec.ts` | Cross-tab reset and change-password scenarios |
| `web/playwright.config.ts` | `globalTimeout` 1,200 s; comment counts |
| `README.md` | Web section: shortlist/notes, change password, test counts |

---

### Task 1: Rules — collection state and notes

**Files:**
- Modify: `firestore.rules`
- Create: `functions/test/rules.collection.test.ts`
- Modify: `web/src/records/validation.ts` (only `LIMITS`), `web/src/records/rulesParity.test.ts`

**Interfaces:**
- Consumes: existing rules functions `signedIn`, `isMember(hid)`, `nonBlankString(v, max)`, `utcMidnight(ts)`.
- Produces: rules accepting exactly the documents later tasks write:
  - `households/{hid}/collection/{rid}`: `{ shortlisted: bool, visited: bool, visitedOn?: timestamp, updatedBy: string, updatedByName: string, updatedAt: serverTimestamp, version: int }`
  - `households/{hid}/restaurants/{rid}/notes/{nid}`: `{ text: string, authorUid, authorName, createdAt, updatedAt, version }`
  - `LIMITS.note = 2000` exported from `web/src/records/validation.ts`.

- [ ] **Step 1: Write the failing rules tests**

Create `functions/test/rules.collection.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc, Timestamp, updateDoc } from "firebase/firestore";

const PROJECT_ID = "demo-safebite";
const RULES_PATH = path.resolve(process.cwd(), "..", "firestore.rules");

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "households/home"), { name: "Home", memberIds: ["ava", "bogdan"], createdAt: new Date() });
    await setDoc(doc(db, "households/other"), { name: "Other", memberIds: ["stranger"], createdAt: new Date() });
    await setDoc(doc(db, "users/ava"), { householdId: "home", displayName: "Ava" });
    await setDoc(doc(db, "users/bogdan"), { householdId: "home", displayName: "Bogdan" });
    await setDoc(doc(db, "users/stranger"), { householdId: "other", displayName: "Stranger" });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
const R = "households/home/restaurants";
const S = "households/home/collection";
const utcDate = (d: string) => Timestamp.fromDate(new Date(`${d}T00:00:00.000Z`));
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const daysAhead = (n: number) => isoDay(new Date(Date.now() + n * 86_400_000));
const NAMES: Record<string, string> = { ava: "Ava", bogdan: "Bogdan", stranger: "Stranger" };

async function seed(docPath: string, data: Record<string, unknown>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), docPath), data);
  });
}

async function seedRestaurant(id: string, over: Record<string, unknown> = {}): Promise<void> {
  await seed(`${R}/${id}`, {
    name: "Seeded",
    address: "Somewhere 1",
    createdBy: "ava",
    createdAt: Timestamp.fromDate(new Date("2026-09-01T10:00:00Z")),
    updatedAt: Timestamp.fromDate(new Date("2026-09-01T10:00:00Z")),
    version: 1,
    deleting: false,
    ...over,
  });
}

/** A valid collection-state write as the client sends it (full document, server updatedAt). */
function stateWrite(uid = "ava", over: Record<string, unknown> = {}): Record<string, unknown> {
  const data: Record<string, unknown> = {
    shortlisted: true,
    visited: false,
    updatedBy: uid,
    updatedByName: NAMES[uid],
    updatedAt: serverTimestamp(),
    version: 1,
    ...over,
  };
  for (const key of Object.keys(data)) if (data[key] === undefined) delete data[key];
  return data;
}

async function seedState(rid: string, over: Record<string, unknown> = {}): Promise<void> {
  await seed(`${S}/${rid}`, { shortlisted: true, visited: false, updatedBy: "ava", updatedByName: "Ava", updatedAt: new Date(), version: 1, ...over });
}

describe("collection — reads", () => {
  it("members read and list; non-members and anonymous do not", async () => {
    await seedRestaurant("r1");
    await seedState("r1");
    await assertSucceeds(getDoc(doc(as("ava"), `${S}/r1`)));
    await assertSucceeds(getDocs(collection(as("bogdan"), S)));
    await assertFails(getDoc(doc(as("stranger"), `${S}/r1`)));
    await assertFails(getDocs(collection(as("stranger"), S)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `${S}/r1`)));
  });
});

describe("collection — create", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
  });

  it.each([
    ["shortlisted only", {}],
    ["visited with a date", { shortlisted: false, visited: true, visitedOn: utcDate("2026-05-03") }],
    ["visited one day ahead of UTC", { visited: true, visitedOn: utcDate(daysAhead(1)) }],
    ["neither flag", { shortlisted: false }],
  ])("accepts %s", async (_label, over) => {
    await assertSucceeds(setDoc(doc(as("ava"), `${S}/r1`), stateWrite("ava", over)));
  });

  it.each([
    ["version is not 1", { version: 2 }],
    ["updatedBy is someone else", { updatedBy: "bogdan" }],
    ["updatedByName is not the caller's display name", { updatedByName: "Bogdan" }],
    ["client-supplied updatedAt", { updatedAt: new Date() }],
    ["visited without visitedOn", { visited: true }],
    ["visitedOn without visited", { visitedOn: utcDate("2026-05-03") }],
    ["visitedOn not at UTC midnight", { visited: true, visitedOn: Timestamp.fromDate(new Date("2026-05-03T10:00:00Z")) }],
    // three, not two: see rules.records.test.ts on request.time near midnight
    ["visitedOn three days ahead", { visited: true, visitedOn: utcDate(daysAhead(3)) }],
    ["shortlisted is a string", { shortlisted: "yes" }],
    ["an unknown key", { rating: 5 }],
    ["a legacy savedBy key", { savedBy: "ava" }],
    ["missing shortlisted", { shortlisted: undefined }],
  ])("rejects a create where %s", async (_label, over) => {
    await assertFails(setDoc(doc(as("ava"), `${S}/r1`), stateWrite("ava", over)));
  });

  it("rejects a create for a missing restaurant or one marked deleting", async () => {
    await assertFails(setDoc(doc(as("ava"), `${S}/ghost`), stateWrite("ava")));
    await seedRestaurant("r2", { deleting: true });
    await assertFails(setDoc(doc(as("ava"), `${S}/r2`), stateWrite("ava")));
  });

  it("rejects a create by a non-member or anonymous client", async () => {
    await assertFails(setDoc(doc(as("stranger"), `${S}/r1`), stateWrite("stranger")));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), `${S}/r1`), stateWrite("ava")));
  });
});

describe("collection — update and delete", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
    await seedState("r1", { version: 3 });
  });

  it("either member writes the next version with their own identity", async () => {
    await assertSucceeds(setDoc(doc(as("bogdan"), `${S}/r1`), stateWrite("bogdan", { shortlisted: false, visited: true, visitedOn: utcDate("2026-05-03"), version: 4 })));
  });

  it.each([
    ["the version is stale", { version: 3 }],
    ["the version skips ahead", { version: 5 }],
    ["updatedByName is spoofed", { version: 4, updatedByName: "Ava" }],
  ])("rejects an update where %s", async (_label, over) => {
    await assertFails(setDoc(doc(as("bogdan"), `${S}/r1`), stateWrite("bogdan", over)));
  });

  it("rejects updates once the restaurant is marked deleting", async () => {
    await seedRestaurant("r1", { deleting: true });
    await assertFails(setDoc(doc(as("ava"), `${S}/r1`), stateWrite("ava", { version: 4 })));
  });

  it("delete is refused while the restaurant is live and allowed once it is marked deleting", async () => {
    await assertFails(deleteDoc(doc(as("ava"), `${S}/r1`)));
    await seedRestaurant("r1", { deleting: true });
    await assertFails(deleteDoc(doc(as("stranger"), `${S}/r1`)));
    await assertSucceeds(deleteDoc(doc(as("bogdan"), `${S}/r1`)));
  });
});

const N = `${R}/r1/notes`;

/** A valid note create as the client sends it. */
function noteCreate(uid = "ava", over: Record<string, unknown> = {}): Record<string, unknown> {
  const data: Record<string, unknown> = {
    text: "Staff knew exactly what coeliac means.",
    authorUid: uid,
    authorName: NAMES[uid],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    version: 1,
    ...over,
  };
  for (const key of Object.keys(data)) if (data[key] === undefined) delete data[key];
  return data;
}

async function seedNote(id: string, uid = "ava", over: Record<string, unknown> = {}): Promise<void> {
  await seed(`${N}/${id}`, { ...noteCreate(uid), createdAt: new Date("2026-09-01T10:00:00Z"), updatedAt: new Date("2026-09-01T10:00:00Z"), version: 2, ...over });
}

describe("notes — reads", () => {
  it("members read and list; non-members and anonymous do not", async () => {
    await seedRestaurant("r1");
    await seedNote("n1");
    await assertSucceeds(getDoc(doc(as("bogdan"), `${N}/n1`)));
    await assertSucceeds(getDocs(collection(as("ava"), N)));
    await assertFails(getDoc(doc(as("stranger"), `${N}/n1`)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `${N}/n1`)));
  });
});

describe("notes — create", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
  });

  it("accepts a note from either member, including exactly 2,000 characters", async () => {
    await assertSucceeds(setDoc(doc(as("ava"), `${N}/a`), noteCreate("ava")));
    await assertSucceeds(setDoc(doc(as("bogdan"), `${N}/b`), noteCreate("bogdan", { text: "x".repeat(2000) })));
  });

  it.each([
    ["text of 2,001 characters", { text: "x".repeat(2001) }],
    ["whitespace-only text", { text: "   " }],
    ["text not a string", { text: 42 }],
    ["authorUid is someone else", { authorUid: "bogdan" }],
    ["authorName is not the caller's display name", { authorName: "Bogdan" }],
    ["client-supplied createdAt", { createdAt: new Date() }],
    ["client-supplied updatedAt", { updatedAt: new Date() }],
    ["version is not 1", { version: 2 }],
    ["an unknown key", { verified: true }],
    ["missing text", { text: undefined }],
  ])("rejects a create where %s", async (_label, over) => {
    await assertFails(setDoc(doc(as("ava"), `${N}/bad`), noteCreate("ava", over)));
  });

  it("rejects a create under a missing parent or a parent marked deleting", async () => {
    await assertFails(setDoc(doc(as("ava"), `${R}/ghost/notes/bad`), noteCreate("ava")));
    await seedRestaurant("r2", { deleting: true });
    await assertFails(setDoc(doc(as("ava"), `${R}/r2/notes/bad`), noteCreate("ava")));
  });

  it("rejects a create by a non-member or anonymous client", async () => {
    await assertFails(setDoc(doc(as("stranger"), `${N}/bad`), noteCreate("stranger")));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), `${N}/bad`), noteCreate("ava")));
  });
});

describe("notes — update", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
    await seedNote("n1", "ava");
  });

  it("the author edits the text with the next version and a server updatedAt", async () => {
    await assertSucceeds(updateDoc(doc(as("ava"), `${N}/n1`), { text: "Edited", version: 3, updatedAt: serverTimestamp() }));
  });

  it.each([
    ["the other member edits", "bogdan", { text: "Edited", version: 3, updatedAt: serverTimestamp() }],
    ["the version is stale", "ava", { text: "Edited", version: 2, updatedAt: serverTimestamp() }],
    ["the version skips ahead", "ava", { text: "Edited", version: 4, updatedAt: serverTimestamp() }],
    ["updatedAt is client-supplied", "ava", { text: "Edited", version: 3, updatedAt: new Date() }],
    ["authorUid changes", "ava", { authorUid: "bogdan", version: 3, updatedAt: serverTimestamp() }],
    ["authorName changes", "ava", { authorName: "Bogdan", version: 3, updatedAt: serverTimestamp() }],
    ["createdAt changes", "ava", { createdAt: new Date(), version: 3, updatedAt: serverTimestamp() }],
    ["text becomes too long", "ava", { text: "x".repeat(2001), version: 3, updatedAt: serverTimestamp() }],
  ])("rejects an update where %s", async (_label, uid, patch) => {
    await assertFails(updateDoc(doc(as(uid), `${N}/n1`), patch));
  });

  it("rejects an author edit while the restaurant is marked deleting", async () => {
    await seedRestaurant("r1", { deleting: true });
    await assertFails(updateDoc(doc(as("ava"), `${N}/n1`), { text: "Edited", version: 3, updatedAt: serverTimestamp() }));
  });
});

describe("notes — delete", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
    await seedNote("n1", "ava");
  });

  it("the author deletes; the other member and non-members may not while the restaurant is live", async () => {
    await assertFails(deleteDoc(doc(as("bogdan"), `${N}/n1`)));
    await assertFails(deleteDoc(doc(as("stranger"), `${N}/n1`)));
    await assertSucceeds(deleteDoc(doc(as("ava"), `${N}/n1`)));
  });

  it("once the restaurant is marked deleting any member may delete (the sweep), never a non-member", async () => {
    await seedRestaurant("r1", { deleting: true });
    await assertFails(deleteDoc(doc(as("stranger"), `${N}/n1`)));
    await assertSucceeds(deleteDoc(doc(as("bogdan"), `${N}/n1`)));
  });

  it("the author may still delete while the restaurant is marked deleting", async () => {
    await seedRestaurant("r1", { deleting: true });
    await assertSucceeds(deleteDoc(doc(as("ava"), `${N}/n1`)));
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npm run emu:test` (10 min timeout)
Expected: the new `rules.collection.test.ts` cases that expect `assertSucceeds` FAIL (default deny); the existing 282 still pass.

- [ ] **Step 3: Add the rules**

In `firestore.rules`, directly after the `isMember(hid)` function, add:

```
    // The caller's own users/{uid} document. Rules get() is not subject to the read rules, so no
    // peer-user read is introduced. Used wherever a stored display name must be the writer's own.
    function callerName() {
      return get(/databases/$(database)/documents/users/$(request.auth.uid)).data.displayName;
    }
```

Inside `match /restaurants/{rid}`, after the closing brace of `match /claims/{cid}`, add:

```
        // Authored notes (spec §3.7). Only the author edits; the author deletes at any time, and
        // any member may delete once the restaurant is marked deleting (deletion sweep).
        match /notes/{nid} {
          function noteParent() {
            return get(/databases/$(database)/documents/households/$(hid)/restaurants/$(rid));
          }

          allow read: if isMember(hid);

          allow create: if isMember(hid)
            && exists(/databases/$(database)/documents/households/$(hid)/restaurants/$(rid))
            && noteParent().data.deleting == false
            && request.resource.data.keys().hasOnly(['text', 'authorUid', 'authorName', 'createdAt', 'updatedAt', 'version'])
            && request.resource.data.keys().hasAll(['text', 'authorUid', 'authorName', 'createdAt', 'updatedAt', 'version'])
            && nonBlankString(request.resource.data.text, 2000)
            && request.resource.data.authorUid == request.auth.uid
            && request.resource.data.authorName == callerName()
            && request.resource.data.createdAt == request.time
            && request.resource.data.updatedAt == request.time
            && request.resource.data.version == 1;

          allow update: if isMember(hid)
            && resource.data.authorUid == request.auth.uid
            && noteParent().data.deleting == false
            && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['text', 'updatedAt', 'version'])
            && nonBlankString(request.resource.data.text, 2000)
            && request.resource.data.updatedAt == request.time
            && request.resource.data.version == resource.data.version + 1;

          // Author first: `||` short-circuits, so an author can delete even if the parent is gone.
          allow delete: if isMember(hid)
            && (resource.data.authorUid == request.auth.uid || noteParent().data.deleting == true);
        }
```

Inside `match /households/{hid}`, after the closing brace of `match /restaurants/{rid}`, add:

```
      // Shortlist and visited state, one document per restaurant, id = restaurant id (spec §3.7).
      match /collection/{rid} {
        function stateParentPath() {
          return /databases/$(database)/documents/households/$(hid)/restaurants/$(rid);
        }
        function liveParent() {
          return exists(stateParentPath()) && get(stateParentPath()).data.deleting == false;
        }
        function validState(data) {
          return data.keys().hasOnly(['shortlisted', 'visited', 'visitedOn', 'updatedBy', 'updatedByName', 'updatedAt', 'version'])
            && data.keys().hasAll(['shortlisted', 'visited', 'updatedBy', 'updatedByName', 'updatedAt', 'version'])
            && data.shortlisted is bool
            && data.visited is bool
            && data.visited == ('visitedOn' in data)
            && (!('visitedOn' in data)
                || (utcMidnight(data.visitedOn) && data.visitedOn <= request.time + duration.value(1, 'd')))
            && data.updatedBy == request.auth.uid
            && data.updatedByName == callerName()
            && data.updatedAt == request.time
            && data.version is int;
        }

        allow read: if isMember(hid);
        allow create: if isMember(hid) && liveParent() && validState(request.resource.data)
          && request.resource.data.version == 1;
        allow update: if isMember(hid) && liveParent() && validState(request.resource.data)
          && request.resource.data.version == resource.data.version + 1;
        // Deletion sweep only: the restaurant must exist and be marked deleting.
        allow delete: if isMember(hid) && exists(stateParentPath()) && get(stateParentPath()).data.deleting == true;
      }
```

Check the brace nesting: `collection` sits beside `restaurants` inside `households/{hid}`; `notes` sits beside `claims` inside `restaurants/{rid}`.

- [ ] **Step 4: Add `LIMITS.note` and its parity check**

In `web/src/records/validation.ts` change the `LIMITS` line to:

```ts
export const LIMITS = { name: 120, address: 300, phone: 40, website: 300, detail: 1000, sourceLabel: 200, sourceUrl: 500, googlePlaceId: 200, note: 2000 } as const;
```

In `web/src/records/rulesParity.test.ts`, at the end of the `"carries the same field limits as validation.ts"` test body, add:

```ts
    expect(rules).toContain(`nonBlankString(request.resource.data.text, ${LIMITS.note})`);
```

- [ ] **Step 5: Run everything**

Run: `npm run emu:test` → all pass (282 + the new file's cases).
Run: `npm run typecheck && npm run test:unit` → pass (270; the parity test gains an assertion, not a test).
Run: `npm run emu:e2e` → 29 pass (rules only grew).

- [ ] **Step 6: Commit**

```bash
git add firestore.rules functions/test/rules.collection.test.ts web/src/records/validation.ts web/src/records/rulesParity.test.ts
git commit -m "feat(rules): shortlist/visited state and authored notes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 2: Deletion completion gate — rules, read-before-delete protocol, mixed-version proof

**Files:**
- Modify: `firestore.rules` (restaurant match)
- Modify: `functions/test/rules.records.test.ts`
- Create: `functions/test/rules.deletion.test.ts`
- Create: `web/src/test/memoryFirestore.ts`
- Modify: `web/src/records/repository.ts`, `web/src/records/repository.test.ts`
- Modify: `web/src/records/messages.ts`; create `web/src/records/messages.test.ts`
- Modify: `web/src/records/RestaurantsPage.tsx`, `web/src/records/RestaurantFormPage.tsx` (progress text only)

**Interfaces:**
- Consumes: Task 1 rules (`collection/{rid}` delete while parent `deleting`; notes delete by any member while parent `deleting`).
- Produces (all in `web/src/records/repository.ts`, used by Tasks 3–6):
  - `export type DeleteStep = "marking" | "sweeping" | "sweepingNotes" | "removing"`
  - `export class ConflictError extends Error {}`, `export class NotFoundError extends Error {}`
  - `export function classify(err: unknown): WriteOutcome<never>`
  - `export async function write<T>(run: (tx: Transaction) => Promise<T>): Promise<WriteOutcome<T>>`
  - `export const LISTEN`, `export function listenerFailure(err: FirestoreError): Snapshot<never>`, `export function toDate(value: unknown): Date`
  - `export const restaurantRef(hid, rid)`, `export const notesCol(hid, rid)`, `export const collectionRef(hid, rid)`
  - `export function sweepNotes(hid, rid): Promise<WriteOutcome<number>>`, `export function removeCollectionState(hid, rid): Promise<WriteOutcome>`, `export function markCleanupDone(hid, rid): Promise<WriteOutcome>`
  - `finishDeleting(hid, rid, onProgress?)` runs `sweeping → sweepingNotes → removing` (claims, notes, state document, `cleanupDone`, restaurant).
  - `messages.ts`: `export function deleteProgressText(step: DeleteStep): string`
  - `web/src/test/memoryFirestore.ts`: `type Store`, `memoryTransactions(runTransaction, store)`, `memoryPage(store, collectionPath)`

- [ ] **Step 1: Write the failing rules tests for the gate**

In `functions/test/rules.records.test.ts`:

(a) In the `"rejects a create where %s"` table of `describe("restaurants — create")`, add the row:

```ts
    ["cleanupDone is set on create", { cleanupDone: false }],
```

(b) Replace the test `"accepts deleting a marked restaurant by either member, never by a non-member"` with:

```ts
  it("accepts deleting a marked, cleaned-up restaurant by either member, never by a non-member", async () => {
    const p = await seedRestaurant("r1", { deleting: true, cleanupDone: true });
    await assertFails(deleteDoc(doc(as("stranger"), p)));
    await assertSucceeds(deleteDoc(doc(as("bogdan"), p)));
  });
```

(c) Append a new describe block at the end of the restaurant section (before `const utcDate = …`):

```ts
describe("restaurants — deletion completion gate (spec §3.7, audit F1)", () => {
  it("rejects adding cleanupDone through an ordinary update or together with the deleting mark", async () => {
    const p = await seedRestaurant("r1");
    await assertFails(updateDoc(doc(as("ava"), p), { name: "x", cleanupDone: true, version: 4, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("ava"), p), { deleting: true, cleanupDone: true, version: 4, updatedAt: serverTimestamp() }));
  });

  it("accepts marking cleanup done on a restaurant marked deleting (only cleanupDone, version, updatedAt)", async () => {
    const p = await seedRestaurant("r1", { deleting: true, version: 4 });
    await assertSucceeds(updateDoc(doc(as("bogdan"), p), { cleanupDone: true, version: 5, updatedAt: serverTimestamp() }));
  });

  it.each([
    ["the restaurant is live", { deleting: false, version: 4 }, { cleanupDone: true, version: 5, updatedAt: serverTimestamp() }],
    ["the version is stale", { deleting: true, version: 4 }, { cleanupDone: true, version: 4, updatedAt: serverTimestamp() }],
    ["cleanupDone is false", { deleting: true, version: 4 }, { cleanupDone: false, version: 5, updatedAt: serverTimestamp() }],
    ["another field changes too", { deleting: true, version: 4 }, { cleanupDone: true, name: "x", version: 5, updatedAt: serverTimestamp() }],
    ["updatedAt is client-supplied", { deleting: true, version: 4 }, { cleanupDone: true, version: 5, updatedAt: new Date() }],
    ["it is already done", { deleting: true, cleanupDone: true, version: 4 }, { cleanupDone: true, version: 5, updatedAt: serverTimestamp() }],
  ])("rejects marking cleanup done when %s", async (_label, seeded, patch) => {
    const p = await seedRestaurant("r1", seeded);
    await assertFails(updateDoc(doc(as("ava"), p), patch));
  });

  it("refuses the final delete until cleanupDone is set and the collection document is gone", async () => {
    const p = await seedRestaurant("r1", { deleting: true });
    await assertFails(deleteDoc(doc(as("ava"), p))); // a Plan 3-era finisher stops here
    await seedRestaurant("r1", { deleting: true, cleanupDone: true });
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "households/home/collection/r1"), { shortlisted: true, visited: false, updatedBy: "ava", updatedByName: "Ava", updatedAt: new Date(), version: 1 });
    });
    await assertFails(deleteDoc(doc(as("ava"), p)));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await deleteDoc(doc(ctx.firestore(), "households/home/collection/r1"));
    });
    await assertSucceeds(deleteDoc(doc(as("ava"), p)));
  });
});
```

- [ ] **Step 2: Write the failing mixed-version protocol tests**

Create `functions/test/rules.deletion.test.ts`:

```ts
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, limit, query, runTransaction, serverTimestamp, setDoc, Timestamp } from "firebase/firestore";

/**
 * The deletion protocol against the real rules with mixed client versions (spec §3.7, audit F1).
 * `oldFinish` is the merged Plan 3 client's finishDeleting (blind claim sweep, blind restaurant
 * delete). `newFinish` mirrors web/src/records/repository.ts finishDeleting after Plan 4 (every
 * step reads before it deletes). Keep newFinish in step with the repository.
 */
const PROJECT_ID = "demo-safebite";
const RULES_PATH = path.resolve(process.cwd(), "..", "firestore.rules");
const R = "households/home/restaurants";
const S = "households/home/collection";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync(RULES_PATH, "utf8"), host: "127.0.0.1", port: 8080 },
  });
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "households/home"), { name: "Home", memberIds: ["ava", "bogdan"], createdAt: new Date() });
    await setDoc(doc(db, "users/ava"), { householdId: "home", displayName: "Ava" });
    await setDoc(doc(db, "users/bogdan"), { householdId: "home", displayName: "Bogdan" });
  });
});

afterAll(async () => {
  await env.cleanup();
});

const as = (uid: string) => env.authenticatedContext(uid).firestore();
type Db = ReturnType<typeof as>;

/** A restaurant a member has marked deleting, still holding a claim, both members' notes and state. */
async function seedDoomed(rid: string): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const at = Timestamp.fromDate(new Date("2026-09-01T10:00:00Z"));
    await setDoc(doc(db, `${R}/${rid}`), { name: "Doomed", address: "1 Road", createdBy: "ava", createdAt: at, updatedAt: at, version: 2, deleting: true });
    await setDoc(doc(db, `${R}/${rid}/claims/c1`), { kind: "gfMenu", value: "yes", detail: "", source: { type: "ownVisit", label: "x" }, checkedAt: Timestamp.fromDate(new Date("2026-09-01T00:00:00Z")), authorUid: "ava", authorName: "Ava", createdAt: at });
    await setDoc(doc(db, `${R}/${rid}/notes/n-ava`), { text: "Ava's note", authorUid: "ava", authorName: "Ava", createdAt: at, updatedAt: at, version: 1 });
    await setDoc(doc(db, `${R}/${rid}/notes/n-bogdan`), { text: "Bogdan's note", authorUid: "bogdan", authorName: "Bogdan", createdAt: at, updatedAt: at, version: 1 });
    await setDoc(doc(db, `${S}/${rid}`), { shortlisted: true, visited: false, updatedBy: "ava", updatedByName: "Ava", updatedAt: at, version: 1 });
  });
}

interface Remaining { restaurant: boolean; claims: number; notes: number; state: boolean }

async function remaining(rid: string): Promise<Remaining> {
  let out: Remaining = { restaurant: false, claims: 0, notes: 0, state: false };
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    out = {
      restaurant: (await getDoc(doc(db, `${R}/${rid}`))).exists(),
      claims: (await getDocs(collection(db, `${R}/${rid}/claims`))).size,
      notes: (await getDocs(collection(db, `${R}/${rid}/notes`))).size,
      state: (await getDoc(doc(db, `${S}/${rid}`))).exists(),
    };
  });
  return out;
}

const GONE: Remaining = { restaurant: false, claims: 0, notes: 0, state: false };

async function oldFinish(db: Db, rid: string): Promise<void> {
  const claims = await getDocs(query(collection(db, `${R}/${rid}/claims`), limit(100)));
  await runTransaction(db, async (tx) => {
    for (const c of claims.docs) tx.delete(c.ref);
  });
  await runTransaction(db, async (tx) => {
    tx.delete(doc(db, `${R}/${rid}`));
  });
}

async function sweepSub(db: Db, rid: string, sub: "claims" | "notes"): Promise<void> {
  for (;;) {
    const page = await getDocs(query(collection(db, `${R}/${rid}/${sub}`), limit(100)));
    if (page.empty) return;
    await runTransaction(db, async (tx) => {
      const snaps = await Promise.all(page.docs.map((d) => tx.get(d.ref)));
      for (const s of snaps) if (s.exists()) tx.delete(s.ref);
    });
  }
}

const NEW_STEPS: Array<(db: Db, rid: string) => Promise<void>> = [
  (db, rid) => sweepSub(db, rid, "claims"),
  (db, rid) => sweepSub(db, rid, "notes"),
  (db, rid) =>
    runTransaction(db, async (tx) => {
      const s = await tx.get(doc(db, `${S}/${rid}`));
      if (s.exists()) tx.delete(s.ref);
    }),
  (db, rid) =>
    runTransaction(db, async (tx) => {
      const r = await tx.get(doc(db, `${R}/${rid}`));
      if (!r.exists() || r.get("cleanupDone") === true) return;
      tx.update(r.ref, { cleanupDone: true, version: (r.get("version") as number) + 1, updatedAt: serverTimestamp() });
    }),
  (db, rid) =>
    runTransaction(db, async (tx) => {
      const r = await tx.get(doc(db, `${R}/${rid}`));
      if (r.exists()) tx.delete(r.ref);
    }),
];

async function newFinish(db: Db, rid: string, stepsToRun = NEW_STEPS.length): Promise<void> {
  for (const step of NEW_STEPS.slice(0, stepsToRun)) await step(db, rid);
}

describe("deletion protocol with mixed client versions", () => {
  it("a Plan 3-era finisher is refused at the final delete and leaves a resumable parent; a Plan 4 finisher completes it", async () => {
    await seedDoomed("r1");
    await assertFails(oldFinish(as("bogdan"), "r1"));
    expect(await remaining("r1")).toEqual({ restaurant: true, claims: 0, notes: 2, state: true });
    await newFinish(as("ava"), "r1");
    expect(await remaining("r1")).toEqual(GONE);
  });

  it("an old resumer racing a new deleter never leaves notes or state without their restaurant", async () => {
    await seedDoomed("r1");
    await Promise.allSettled([oldFinish(as("bogdan"), "r1"), newFinish(as("ava"), "r1")]);
    const after = await remaining("r1");
    if (!after.restaurant) expect(after).toEqual(GONE);
    await newFinish(as("ava"), "r1");
    expect(await remaining("r1")).toEqual(GONE);
  });

  it("two Plan 4 finishers at once both succeed", async () => {
    await seedDoomed("r1");
    await Promise.all([newFinish(as("ava"), "r1"), newFinish(as("bogdan"), "r1")]);
    expect(await remaining("r1")).toEqual(GONE);
  });

  it.each([1, 2, 3, 4])("a retry after %i completed step(s) finishes without a permission failure", async (done) => {
    await seedDoomed("r1");
    await newFinish(as("ava"), "r1", done);
    await newFinish(as("bogdan"), "r1");
    expect(await remaining("r1")).toEqual(GONE);
  });

  it("a finisher running after everything is already gone is a no-op, not a failure", async () => {
    await seedDoomed("r1");
    await newFinish(as("ava"), "r1");
    await newFinish(as("bogdan"), "r1");
    expect(await remaining("r1")).toEqual(GONE);
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm run emu:test`
Expected: FAIL. The existing delete test now seeds `cleanupDone` (an unknown key for `validRestaurant`) but the old delete rule ignores it; the mark-done cases fail (no branch). The mixed-version "refused" case FAILS because the old rule lets `oldFinish` delete the restaurant.

- [ ] **Step 4: Implement the gate in the rules**

In `firestore.rules`:

(a) In `validRestaurant(data)`, add `'cleanupDone'` to the `hasOnly` list and append a type check, so the function reads:

```
    function validRestaurant(data) {
      return data.keys().hasOnly(['name', 'address', 'phone', 'website', 'lat', 'lng', 'googlePlaceId', 'createdBy', 'createdAt', 'updatedAt', 'version', 'deleting', 'cleanupDone'])
        && data.keys().hasAll(['name', 'address', 'createdBy', 'createdAt', 'updatedAt', 'version', 'deleting'])
        && nonBlankString(data.name, 120)
        && nonBlankString(data.address, 300)
        && optionalString(data, 'phone', 40)
        && optionalHttpUrl(data, 'website', 300)
        && optionalString(data, 'googlePlaceId', 200)
        && validCoordinates(data)
        && data.createdBy is string
        && data.createdAt is timestamp
        && data.updatedAt is timestamp
        && data.version is int
        && data.deleting is bool
        && (!('cleanupDone' in data) || data.cleanupDone is bool);
    }
```

(b) After `isMarkingDeleting()`, add:

```
    // Deletion protocol, completion gate (spec §3.7, audit F1): set only after the client's claim
    // and note sweeps returned empty from the server and the collection document is gone. Nothing
    // can be created under a marked restaurant, so the flag cannot go stale.
    function isMarkingCleanupDone() {
      return resource.data.deleting == true
        && resource.data.get('cleanupDone', false) == false
        && request.resource.data.get('cleanupDone', false) == true
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['cleanupDone', 'version', 'updatedAt']);
    }
```

(c) In `match /restaurants/{rid}`, replace the `allow create`, `allow update` and `allow delete` rules with:

```
        allow create: if isMember(hid)
          && validRestaurant(request.resource.data)
          && !('cleanupDone' in request.resource.data)
          && request.resource.data.createdBy == request.auth.uid
          && request.resource.data.version == 1
          && request.resource.data.deleting == false
          && request.resource.data.createdAt == request.time
          && request.resource.data.updatedAt == request.time;

        // Optimistic concurrency: exactly the next version, server-stamped. Once deleting is true
        // the only permitted change is marking cleanup done (so a claim sweep cannot be undercut).
        allow update: if isMember(hid)
          && validRestaurant(request.resource.data)
          && request.resource.data.createdBy == resource.data.createdBy
          && request.resource.data.createdAt == resource.data.createdAt
          && request.resource.data.updatedAt == request.time
          && request.resource.data.version == resource.data.version + 1
          && ((resource.data.deleting == false
                && !('cleanupDone' in request.resource.data)
                && (request.resource.data.deleting == false || isMarkingDeleting()))
              || isMarkingCleanupDone());

        // Final step: only a marked restaurant whose cleanup is done and whose collection
        // document is gone. A client that skips the note/state sweep cannot pass this.
        allow delete: if isMember(hid)
          && resource.data.deleting == true
          && resource.data.get('cleanupDone', false) == true
          && !exists(/databases/$(database)/documents/households/$(hid)/collection/$(rid));
```

- [ ] **Step 5: Run the rules tests**

Run: `npm run emu:test`
Expected: PASS. All earlier tests pass, plus the new gate cases and the mixed-version file (8 cases).

- [ ] **Step 6: Add the shared in-memory Firestore fake**

Create `web/src/test/memoryFirestore.ts`:

```ts
import { vi, type Mock } from "vitest";

/** Document path → data. Paths look like "households/home/restaurants/r1". */
export type Store = Map<string, Record<string, unknown>>;

interface Ref {
  id: string;
  path: string;
}

function snapshot(store: Store, ref: Ref) {
  const data = store.get(ref.path);
  return { id: ref.id, ref, exists: () => data !== undefined, data: () => (data === undefined ? undefined : { ...data }) };
}

/**
 * Wires a mocked `runTransaction` to an in-memory store, so a sequence of repository calls sees
 * its own earlier writes. Test-only; paths come from the `doc`/`collection` mocks each test file
 * installs (they join segments with "/").
 */
export function memoryTransactions(runTransaction: Mock, store: Store) {
  const tx = {
    get: vi.fn(async (ref: Ref) => snapshot(store, ref)),
    set: vi.fn((ref: Ref, data: Record<string, unknown>) => {
      store.set(ref.path, { ...data });
    }),
    update: vi.fn((ref: Ref, patch: Record<string, unknown>) => {
      store.set(ref.path, { ...store.get(ref.path), ...patch });
    }),
    delete: vi.fn((ref: Ref) => {
      store.delete(ref.path);
    }),
  };
  runTransaction.mockImplementation(async (_db: unknown, run: (t: typeof tx) => Promise<unknown>) => run(tx));
  return tx;
}

/** The documents directly under `collectionPath`, shaped like a getDocsFromServer page. */
export function memoryPage(store: Store, collectionPath: string, pageSize = 100) {
  const prefix = `${collectionPath}/`;
  const docs = [...store.keys()]
    .filter((p) => p.startsWith(prefix) && !p.slice(prefix.length).includes("/"))
    .slice(0, pageSize)
    .map((p) => {
      const id = p.slice(prefix.length);
      return { id, ref: { id, path: p } };
    });
  return { empty: docs.length === 0, size: docs.length, docs };
}
```

- [ ] **Step 7: Write the failing repository tests**

In `web/src/records/repository.test.ts`:

(a) Add to the imports from `"./repository"`: `finishDeleting`, `markCleanupDone`, `removeCollectionState`, `sweepNotes`. Add `import { memoryPage, memoryTransactions, type Store } from "../test/memoryFirestore";`.

(b) Delete the test `"deleteRestaurant runs mark → sweep → remove and reports progress; stops at the first non-ok outcome"` and add, inside `describe("deletion protocol")`:

```ts
  const RP = "households/home/restaurants/r1";

  function doomedStore(over: Record<string, unknown> = {}): Store {
    return new Map<string, Record<string, unknown>>([
      [RP, { ...storedRestaurant, deleting: true, version: 4, ...over }],
      [`${RP}/claims/c1`, { kind: "gfMenu" }],
      [`${RP}/claims/c2`, { kind: "separateFryer" }],
      [`${RP}/notes/n1`, { text: "Ava's", authorUid: "ava-uid" }],
      [`${RP}/notes/n2`, { text: "Bogdan's", authorUid: "bogdan-uid" }],
      ["households/home/collection/r1", { shortlisted: true, visited: false, version: 2 }],
    ]);
  }

  it("finishDeleting sweeps claims and notes, removes the state document, marks cleanupDone, then removes the restaurant", async () => {
    const store = doomedStore();
    const tx = memoryTransactions(m.runTransaction, store);
    m.getDocsFromServer.mockImplementation(async (q: { path: string }) => memoryPage(store, q.path));
    const steps: string[] = [];
    expect(await finishDeleting("home", "r1", (s) => steps.push(s))).toEqual({ kind: "ok", value: undefined });
    expect(steps).toEqual(["sweeping", "sweepingNotes", "removing"]);
    expect(store.size).toBe(0);
    expect(tx.update).toHaveBeenCalledWith({ id: "r1", path: RP }, { cleanupDone: true, version: 5, updatedAt: serverTimestamp() });
    const updateOrder = tx.update.mock.invocationCallOrder[0]!;
    const restaurantDelete = tx.delete.mock.calls.findIndex(([ref]) => (ref as { path: string }).path === RP);
    expect(tx.delete.mock.invocationCallOrder[restaurantDelete]!).toBeGreaterThan(updateOrder);
  });

  it("sweeps skip documents another sweeper already removed instead of failing", async () => {
    const store = doomedStore();
    const tx = memoryTransactions(m.runTransaction, store);
    store.delete(`${RP}/notes/n2`); // removed between the page read and this transaction
    m.getDocsFromServer
      .mockResolvedValueOnce({ empty: false, size: 2, docs: [{ id: "n1", ref: { id: "n1", path: `${RP}/notes/n1` } }, { id: "n2", ref: { id: "n2", path: `${RP}/notes/n2` } }] })
      .mockResolvedValueOnce({ empty: true, size: 0, docs: [] });
    expect(await sweepNotes("home", "r1")).toEqual({ kind: "ok", value: 1 });
    expect(tx.delete).toHaveBeenCalledTimes(1);
  });

  it("finishing an already-removed restaurant is a no-op, not a failure", async () => {
    const store: Store = new Map();
    const tx = memoryTransactions(m.runTransaction, store);
    m.getDocsFromServer.mockImplementation(async (q: { path: string }) => memoryPage(store, q.path));
    expect(await finishDeleting("home", "r1")).toEqual({ kind: "ok", value: undefined });
    expect(tx.update).not.toHaveBeenCalled();
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("markCleanupDone refuses a live restaurant and does nothing when already set", async () => {
    memoryTransactions(m.runTransaction, new Map([[RP, { ...storedRestaurant }]]));
    expect(await markCleanupDone("home", "r1")).toEqual({ kind: "notFound" });
    const tx = memoryTransactions(m.runTransaction, new Map([[RP, { ...storedRestaurant, deleting: true, cleanupDone: true }]]));
    expect(await markCleanupDone("home", "r1")).toEqual({ kind: "ok", value: undefined });
    expect(tx.update).not.toHaveBeenCalled();
  });

  it("removeCollectionState deletes only a document that exists", async () => {
    const tx = memoryTransactions(m.runTransaction, new Map());
    expect(await removeCollectionState("home", "r1")).toEqual({ kind: "ok", value: undefined });
    expect(tx.delete).not.toHaveBeenCalled();
  });

  it("deleteRestaurant runs mark → sweeps → remove and reports every step; stops at the first non-ok outcome", async () => {
    const store = doomedStore({ deleting: false, version: 3 });
    memoryTransactions(m.runTransaction, store);
    m.getDocsFromServer.mockImplementation(async (q: { path: string }) => memoryPage(store, q.path));
    const steps: string[] = [];
    expect(await deleteRestaurant("home", "r1", 3, (s) => steps.push(s))).toEqual({ kind: "ok", value: undefined });
    expect(steps).toEqual(["marking", "sweeping", "sweepingNotes", "removing"]);
    expect(store.size).toBe(0);

    const stopped: string[] = [];
    fakeTx({ exists: true, data: { ...storedRestaurant, version: 9 } });
    expect(await deleteRestaurant("home", "r1", 3, (s) => stopped.push(s))).toEqual({ kind: "conflict" });
    expect(stopped).toEqual(["marking"]);
  });
```

Create `web/src/records/messages.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deleteProgressText } from "./messages";

describe("deleteProgressText", () => {
  it("names every deletion step", () => {
    expect(deleteProgressText("marking")).toBe("Marking…");
    expect(deleteProgressText("sweeping")).toBe("Removing evidence…");
    expect(deleteProgressText("sweepingNotes")).toBe("Removing notes…");
    expect(deleteProgressText("removing")).toBe("Removing restaurant…");
  });
});
```

- [ ] **Step 8: Run to verify they fail**

Run: `npm --prefix web test -- repository messages`
Expected: FAIL (`finishDeleting` does not sweep notes; `sweepNotes`, `markCleanupDone`, `removeCollectionState`, `deleteProgressText` missing).

- [ ] **Step 9: Implement the repository changes**

In `web/src/records/repository.ts`:

(a) Add `type CollectionReference` to the `firebase/firestore` type imports.

(b) Replace the lines from `export type DeleteStep …` through `const claimsCol = …` with:

```ts
export type DeleteStep = "marking" | "sweeping" | "sweepingNotes" | "removing";

/** Documents deleted per transaction during a sweep (well under Firestore's per-transaction limit). */
export const SWEEP_PAGE = 100;

// The helpers below are exported for the sibling record modules (collection.ts, notes.ts) only.
export class ConflictError extends Error {}
export class NotFoundError extends Error {}

const restaurantsCol = (hid: string) => collection(db, "households", hid, "restaurants");
export const restaurantRef = (hid: string, rid: string) => doc(db, "households", hid, "restaurants", rid);
const claimsCol = (hid: string, rid: string) => collection(db, "households", hid, "restaurants", rid, "claims");
export const notesCol = (hid: string, rid: string) => collection(db, "households", hid, "restaurants", rid, "notes");
export const collectionRef = (hid: string, rid: string) => doc(db, "households", hid, "collection", rid);
```

(c) Add `export` to `function toDate`, `function listenerFailure`, `const LISTEN`, `function classify` and `async function write`. Their bodies are unchanged.

(d) Replace `sweepClaims`, `removeRestaurant` and `finishDeleting` (everything from the `/** Deletion step 2 …` comment up to, but not including, the `/** The whole protocol …` comment) with:

```ts
/**
 * Deletion steps 2–3 (spec §3.7): server-read pages; each page's documents are re-read inside one
 * transaction and only those still present are deleted, so two finishers and retries converge
 * instead of one of them failing on an already-deleted document.
 */
async function sweep(col: CollectionReference): Promise<WriteOutcome<number>> {
  let deleted = 0;
  for (;;) {
    let page;
    try {
      page = await getDocsFromServer(query(col, limit(SWEEP_PAGE)));
    } catch (err) {
      return classify(err);
    }
    if (page.empty) return { kind: "ok", value: deleted };
    const refs = page.docs.map((d) => d.ref);
    const outcome = await write(async (tx) => {
      const snaps = await Promise.all(refs.map((ref) => tx.get(ref)));
      let removed = 0;
      for (const snap of snaps) {
        if (snap.exists()) {
          tx.delete(snap.ref);
          removed += 1;
        }
      }
      return removed;
    });
    if (outcome.kind !== "ok") return outcome;
    deleted += outcome.value;
  }
}

export function sweepClaims(hid: string, rid: string): Promise<WriteOutcome<number>> {
  return sweep(claimsCol(hid, rid));
}

export function sweepNotes(hid: string, rid: string): Promise<WriteOutcome<number>> {
  return sweep(notesCol(hid, rid));
}

/** Deletion step 4: the shortlist/visited document, if any. */
export function removeCollectionState(hid: string, rid: string): Promise<WriteOutcome> {
  return write(async (tx) => {
    const snap = await tx.get(collectionRef(hid, rid));
    if (snap.exists()) tx.delete(snap.ref);
  });
}

/** Deletion step 5, the completion gate. Already removed or already done counts as done. */
export function markCleanupDone(hid: string, rid: string): Promise<WriteOutcome> {
  return write(async (tx) => {
    const snap = await tx.get(restaurantRef(hid, rid));
    if (!snap.exists()) return;
    const d = snap.data() as DocumentData;
    if (d.deleting !== true) throw new NotFoundError();
    if (d.cleanupDone === true) return;
    tx.update(snap.ref, { cleanupDone: true, version: Number(d.version) + 1, updatedAt: serverTimestamp() });
  });
}

/** Deletion step 6. The rules refuse this unless the gate is satisfied. Already removed counts as done. */
export function removeRestaurant(hid: string, rid: string): Promise<WriteOutcome> {
  return write(async (tx) => {
    const snap = await tx.get(restaurantRef(hid, rid));
    if (snap.exists()) tx.delete(snap.ref);
  });
}

export async function finishDeleting(hid: string, rid: string, onProgress?: (step: DeleteStep) => void): Promise<WriteOutcome> {
  onProgress?.("sweeping");
  const claims = await sweepClaims(hid, rid);
  if (claims.kind !== "ok") return claims;
  onProgress?.("sweepingNotes");
  const notes = await sweepNotes(hid, rid);
  if (notes.kind !== "ok") return notes;
  onProgress?.("removing");
  const state = await removeCollectionState(hid, rid);
  if (state.kind !== "ok") return state;
  const done = await markCleanupDone(hid, rid);
  if (done.kind !== "ok") return done;
  return removeRestaurant(hid, rid);
}
```

Update the module comment's second paragraph reference: the deletion protocol is now "spec §3.5, extended by §3.7".

In `web/src/records/messages.ts` add:

```ts
import type { DeleteStep } from "./repository";

const DELETE_PROGRESS: Record<DeleteStep, string> = {
  marking: "Marking…",
  sweeping: "Removing evidence…",
  sweepingNotes: "Removing notes…",
  removing: "Removing restaurant…",
};

export function deleteProgressText(step: DeleteStep): string {
  return DELETE_PROGRESS[step];
}
```

Merge the new `DeleteStep` import into the existing `import type { WriteOutcome } from "./repository";` line, making it `import type { DeleteStep, WriteOutcome } from "./repository";`.

In `web/src/records/RestaurantsPage.tsx` and `web/src/records/RestaurantFormPage.tsx`, delete the local `STEP_TEXT` constant and the `type DeleteStep` import. Replace every `STEP_TEXT[step]` with `deleteProgressText(step)` and `STEP_TEXT.sweeping` with `deleteProgressText("sweeping")`, and import `deleteProgressText` from `"./messages"`. The form already imports `outcomeMessage` from there, so add `deleteProgressText` to that import.

- [ ] **Step 10: Run the gates**

Run: `npm run typecheck && npm run test:unit` → PASS (270 + 7 new: 6 repository, 1 messages; one repository test replaced).
Run: `npm run emu:test` → PASS.
Run: `npm run emu:e2e` → 29 PASS. Records scenarios 4 and 5 now finish deletion through the gate.

- [ ] **Step 11: Commit**

```bash
git add firestore.rules functions/test/rules.records.test.ts functions/test/rules.deletion.test.ts web/src/test/memoryFirestore.ts web/src/records/repository.ts web/src/records/repository.test.ts web/src/records/messages.ts web/src/records/messages.test.ts web/src/records/RestaurantsPage.tsx web/src/records/RestaurantFormPage.tsx
git commit -m "feat(records): deletion completion gate and convergent sweeps

Restaurant delete now requires cleanupDone and no collection document, so
no client version can orphan notes or state; every deletion step reads
before it deletes. Mixed-version protocol proven against the rules.

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 3: Client data layer — types, validation, `collection.ts`, `notes.ts`

**Files:**
- Modify: `web/src/records/types.ts`, `web/src/records/validation.ts`, `web/src/records/validation.test.ts`
- Create: `web/src/records/collection.ts`, `web/src/records/collection.test.ts`
- Create: `web/src/records/notes.ts`, `web/src/records/notes.test.ts`

**Interfaces:**
- Consumes (Task 2, `./repository`): `write`, `ConflictError`, `NotFoundError`, `LISTEN`, `listenerFailure`, `toDate`, `restaurantRef`, `notesCol`, `collectionRef`, `type Snapshot`, `type WriteOutcome`; `./dates`: `fromCalendarDate`, `toCalendarDate`, `isCalendarDate`, `compareCalendarDates`.
- Produces:
  - `types.ts`: `interface CollectionState { shortlisted: boolean; visited: boolean; visitedOn?: CalendarDate; updatedBy: string; updatedByName: string; updatedAt: Date; version: number }` and `interface Note { id: string; text: string; authorUid: string; authorName: string; createdAt: Date; updatedAt: Date; version: number }`
  - `validation.ts`: `validateNoteText(text: string): string | null`, `validateVisitedOn(value: string, today: CalendarDate): string | null`
  - `collection.ts`: `watchCollection(hid, cb: (s: Snapshot<Record<string, CollectionState>>) => void): () => void`, `watchCollectionEntry(hid, rid, cb: (s: Snapshot<CollectionState | null>) => void): () => void`, `setShortlisted(hid, rid, author: Author, baseVersion: number, shortlisted: boolean): Promise<WriteOutcome<number>>`, `setVisited(hid, rid, author: Author, baseVersion: number, visitedOn: CalendarDate | null): Promise<WriteOutcome<number>>`
  - `notes.ts`: `watchNotes(hid, rid, cb: (s: Snapshot<Note[]>) => void): () => void` (newest first), `addNote(hid, rid, author: Author, text: string): Promise<WriteOutcome<string>>`, `updateNote(hid, rid, nid, baseVersion: number, text: string): Promise<WriteOutcome<number>>`, `deleteNote(hid, rid, nid, baseVersion: number): Promise<WriteOutcome>`

A missing collection document means base version 0. The UI treats it as "not shortlisted, not visited" only when the snapshot is `ready` (Tasks 4–5).

- [ ] **Step 1: Write the failing validation tests**

Append to `web/src/records/validation.test.ts` (merge `validateNoteText, validateVisitedOn` into the existing `./validation` import):

```ts
describe("validateNoteText", () => {
  it("refuses blank text and text over the limit, accepts up to 2,000 characters after trimming", () => {
    expect(validateNoteText("   ")).toBe("Write something first.");
    expect(validateNoteText("x".repeat(2001))).toBe("Keep this to 2000 characters.");
    expect(validateNoteText(`  ${"x".repeat(2000)}  `)).toBeNull();
    expect(validateNoteText("Lovely staff")).toBeNull();
  });
});

describe("validateVisitedOn", () => {
  it("needs a real calendar date that is not after the device's today", () => {
    expect(validateVisitedOn("", "2026-09-24")).toBe("Enter the date of the visit.");
    expect(validateVisitedOn("2026-02-30", "2026-09-24")).toBe("Enter the date of the visit.");
    expect(validateVisitedOn("2026-09-25", "2026-09-24")).toBe("The visit date can't be in the future.");
    expect(validateVisitedOn("2026-09-24", "2026-09-24")).toBeNull();
    expect(validateVisitedOn("2025-05-03", "2026-09-24")).toBeNull();
  });
});
```

- [ ] **Step 2: Write the failing `collection.test.ts`**

Create `web/src/records/collection.test.ts`:

```ts
import { serverTimestamp, Timestamp } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryTransactions, type Store } from "../test/memoryFirestore";

const m = vi.hoisted(() => ({ runTransaction: vi.fn(), onSnapshot: vi.fn() }));

vi.mock("../firebase", () => ({ db: { fake: true } }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return {
    ...actual,
    runTransaction: m.runTransaction,
    onSnapshot: m.onSnapshot,
    getDocsFromServer: vi.fn(),
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    doc: (parent: unknown, ...segments: string[]) => {
      const base = typeof (parent as { path?: string }).path === "string" ? (parent as { path: string }).path : "";
      const path = [base, ...segments].filter(Boolean).join("/");
      return { id: segments[segments.length - 1] ?? "", path };
    },
    query: (source: unknown) => source,
    orderBy: () => undefined,
    limit: () => undefined,
  };
});

import { setShortlisted, setVisited, watchCollection, watchCollectionEntry } from "./collection";

const RP = "households/home/restaurants/r1";
const SP = "households/home/collection/r1";
const AVA = { uid: "ava-uid", displayName: "Ava" };
const live = { name: "Da Marco", address: "Via Roma 1", deleting: false, version: 2 };
const stored = { shortlisted: true, visited: true, visitedOn: Timestamp.fromDate(new Date("2026-05-03T00:00:00Z")), updatedBy: "bogdan-uid", updatedByName: "Bogdan", updatedAt: Timestamp.fromDate(new Date("2026-05-03T10:00:00Z")), version: 3 };

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => vi.clearAllMocks());

describe("setShortlisted / setVisited", () => {
  it("creates version 1 from base 0 with the author's identity and a server timestamp", async () => {
    const store: Store = new Map([[RP, live]]);
    memoryTransactions(m.runTransaction, store);
    expect(await setShortlisted("home", "r1", AVA, 0, true)).toEqual({ kind: "ok", value: 1 });
    expect(store.get(SP)).toEqual({ shortlisted: true, visited: false, updatedBy: "ava-uid", updatedByName: "Ava", updatedAt: serverTimestamp(), version: 1 });
  });

  it("changing the shortlist keeps the visit date and bumps the version", async () => {
    const store: Store = new Map<string, Record<string, unknown>>([[RP, live], [SP, stored]]);
    memoryTransactions(m.runTransaction, store);
    expect(await setShortlisted("home", "r1", AVA, 3, false)).toEqual({ kind: "ok", value: 4 });
    expect(store.get(SP)).toMatchObject({ shortlisted: false, visited: true, visitedOn: Timestamp.fromDate(new Date("2026-05-03T00:00:00Z")), updatedBy: "ava-uid", version: 4 });
  });

  it("setVisited stores a UTC-midnight date; clearing drops visitedOn and keeps the shortlist", async () => {
    const store: Store = new Map([[RP, live]]);
    memoryTransactions(m.runTransaction, store);
    expect(await setVisited("home", "r1", AVA, 0, "2026-09-20")).toEqual({ kind: "ok", value: 1 });
    expect((store.get(SP)!.visitedOn as Timestamp).toDate().toISOString()).toBe("2026-09-20T00:00:00.000Z");
    expect(store.get(SP)).toMatchObject({ shortlisted: false, visited: true });
    await setShortlisted("home", "r1", AVA, 1, true);
    expect(await setVisited("home", "r1", AVA, 2, null)).toEqual({ kind: "ok", value: 3 });
    expect(store.get(SP)).not.toHaveProperty("visitedOn");
    expect(store.get(SP)).toMatchObject({ shortlisted: true, visited: false, version: 3 });
  });

  it("reports conflict without writing when the stored version differs from the base", async () => {
    const store: Store = new Map<string, Record<string, unknown>>([[RP, live], [SP, stored]]);
    const tx = memoryTransactions(m.runTransaction, store);
    expect(await setShortlisted("home", "r1", AVA, 2, false)).toEqual({ kind: "conflict" });
    expect(await setShortlisted("home", "r1", AVA, 0, true)).toEqual({ kind: "conflict" });
    expect(tx.set).not.toHaveBeenCalled();
  });

  it("reports notFound for a missing restaurant or one marked deleting", async () => {
    memoryTransactions(m.runTransaction, new Map());
    expect(await setShortlisted("home", "r1", AVA, 0, true)).toEqual({ kind: "notFound" });
    memoryTransactions(m.runTransaction, new Map([[RP, { ...live, deleting: true }]]));
    expect(await setVisited("home", "r1", AVA, 0, "2026-09-20")).toEqual({ kind: "notFound" });
  });

  it("reports offline before starting a transaction when the browser is offline", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    expect(await setShortlisted("home", "r1", AVA, 0, true)).toEqual({ kind: "offline" });
    expect(m.runTransaction).not.toHaveBeenCalled();
  });
});

describe("watchers", () => {
  it("watchCollection maps documents by restaurant id and reports ready/offline", () => {
    const seen: unknown[] = [];
    m.onSnapshot.mockImplementation((_q: unknown, _o: unknown, next: (s: unknown) => void) => {
      next({ metadata: { fromCache: false }, docs: [{ id: "r1", data: () => stored }] });
      next({ metadata: { fromCache: true }, docs: [] });
      return () => {};
    });
    watchCollection("home", (s) => seen.push(s));
    expect(seen[0]).toEqual({ status: "ready", value: { r1: { shortlisted: true, visited: true, visitedOn: "2026-05-03", updatedBy: "bogdan-uid", updatedByName: "Bogdan", updatedAt: new Date("2026-05-03T10:00:00Z"), version: 3 } } });
    expect(seen[1]).toEqual({ status: "offline", value: {} });
  });

  it("watchCollectionEntry reports null for a missing document, with the snapshot's source, and denied on permission errors", () => {
    const seen: unknown[] = [];
    m.onSnapshot.mockImplementation((_r: unknown, _o: unknown, next: (s: unknown) => void, fail: (e: unknown) => void) => {
      next({ metadata: { fromCache: false }, exists: () => false });
      next({ metadata: { fromCache: true }, exists: () => false });
      fail(Object.assign(new Error("denied"), { code: "permission-denied" }));
      return () => {};
    });
    watchCollectionEntry("home", "r1", (s) => seen.push(s));
    expect(seen).toEqual([{ status: "ready", value: null }, { status: "offline", value: null }, { status: "denied" }]);
    expect(m.onSnapshot.mock.calls[0]![1]).toEqual({ includeMetadataChanges: true });
  });
});
```

- [ ] **Step 3: Write the failing `notes.test.ts`**

Create `web/src/records/notes.test.ts`:

```ts
import { serverTimestamp, Timestamp } from "firebase/firestore";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryTransactions, type Store } from "../test/memoryFirestore";

const m = vi.hoisted(() => ({ runTransaction: vi.fn(), onSnapshot: vi.fn(), orderBy: vi.fn() }));

vi.mock("../firebase", () => ({ db: { fake: true } }));
vi.mock("firebase/firestore", async (importOriginal) => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  let generated = 0;
  return {
    ...actual,
    runTransaction: m.runTransaction,
    onSnapshot: m.onSnapshot,
    getDocsFromServer: vi.fn(),
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join("/") }),
    doc: (parent: unknown, ...segments: string[]) => {
      const base = typeof (parent as { path?: string }).path === "string" ? (parent as { path: string }).path : "";
      const id = segments.length > 0 ? segments[segments.length - 1]! : `gen-${++generated}`;
      const path = segments.length > 0 ? [base, ...segments].filter(Boolean).join("/") : `${base}/${id}`;
      return { id, path };
    },
    query: (source: unknown) => source,
    orderBy: m.orderBy,
    limit: () => undefined,
  };
});

import { addNote, deleteNote, updateNote, watchNotes } from "./notes";

const RP = "households/home/restaurants/r1";
const NP = `${RP}/notes/n1`;
const AVA = { uid: "ava-uid", displayName: "Ava" };
const live = { name: "Da Marco", address: "Via Roma 1", deleting: false, version: 2 };
const at = Timestamp.fromDate(new Date("2026-09-01T10:00:00Z"));
const note = { text: "Great staff", authorUid: "ava-uid", authorName: "Ava", createdAt: at, updatedAt: at, version: 2 };

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});
afterEach(() => vi.clearAllMocks());

describe("addNote", () => {
  it("writes version 1, the author's identity and server timestamps under a live restaurant", async () => {
    const store: Store = new Map([[RP, live]]);
    memoryTransactions(m.runTransaction, store);
    const outcome = await addNote("home", "r1", AVA, "Staff knew about cross-contamination.");
    expect(outcome.kind).toBe("ok");
    const id = (outcome as { value: string }).value;
    expect(store.get(`${RP}/notes/${id}`)).toEqual({
      text: "Staff knew about cross-contamination.",
      authorUid: "ava-uid",
      authorName: "Ava",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      version: 1,
    });
  });

  it("reports notFound under a missing restaurant or one marked deleting", async () => {
    memoryTransactions(m.runTransaction, new Map());
    expect((await addNote("home", "r1", AVA, "x")).kind).toBe("notFound");
    memoryTransactions(m.runTransaction, new Map([[RP, { ...live, deleting: true }]]));
    expect((await addNote("home", "r1", AVA, "x")).kind).toBe("notFound");
  });
});

describe("updateNote", () => {
  it("writes only text, updatedAt and the next version", async () => {
    const store: Store = new Map<string, Record<string, unknown>>([[RP, live], [NP, note]]);
    const tx = memoryTransactions(m.runTransaction, store);
    expect(await updateNote("home", "r1", "n1", 2, "Edited")).toEqual({ kind: "ok", value: 3 });
    expect(tx.update).toHaveBeenCalledWith({ id: "n1", path: NP }, { text: "Edited", updatedAt: serverTimestamp(), version: 3 });
  });

  it("reports conflict on a stale base and notFound for a missing note or a restaurant marked deleting", async () => {
    const store: Store = new Map<string, Record<string, unknown>>([[RP, live], [NP, note]]);
    const tx = memoryTransactions(m.runTransaction, store);
    expect(await updateNote("home", "r1", "n1", 1, "Edited")).toEqual({ kind: "conflict" });
    expect(await updateNote("home", "r1", "gone", 1, "Edited")).toEqual({ kind: "notFound" });
    store.set(RP, { ...live, deleting: true });
    expect(await updateNote("home", "r1", "n1", 2, "Edited")).toEqual({ kind: "notFound" });
    expect(tx.update).not.toHaveBeenCalled();
  });
});

describe("deleteNote", () => {
  it("deletes only the version the member confirmed", async () => {
    const store: Store = new Map<string, Record<string, unknown>>([[RP, live], [NP, note]]);
    memoryTransactions(m.runTransaction, store);
    expect(await deleteNote("home", "r1", "n1", 1)).toEqual({ kind: "conflict" });
    expect(store.has(NP)).toBe(true);
    expect(await deleteNote("home", "r1", "n1", 2)).toEqual({ kind: "ok", value: undefined });
    expect(store.has(NP)).toBe(false);
    expect(await deleteNote("home", "r1", "n1", 2)).toEqual({ kind: "notFound" });
  });
});

describe("watchNotes", () => {
  it("lists newest first and reports ready/offline", () => {
    const seen: unknown[] = [];
    m.onSnapshot.mockImplementation((_q: unknown, _o: unknown, next: (s: unknown) => void) => {
      next({ metadata: { fromCache: true }, docs: [{ id: "n1", data: () => note }] });
      return () => {};
    });
    watchNotes("home", "r1", (s) => seen.push(s));
    expect(m.orderBy).toHaveBeenCalledWith("createdAt", "desc");
    expect(seen[0]).toEqual({ status: "offline", value: [{ id: "n1", text: "Great staff", authorUid: "ava-uid", authorName: "Ava", createdAt: new Date("2026-09-01T10:00:00Z"), updatedAt: new Date("2026-09-01T10:00:00Z"), version: 2 }] });
  });
});
```

- [ ] **Step 4: Run to verify they fail**

Run: `npm --prefix web test -- validation collection notes`
Expected: FAIL (modules and functions missing).

- [ ] **Step 5: Implement**

Append to `web/src/records/types.ts`:

```ts
/**
 * Read model of households/{hid}/collection/{rid} (spec §3.7): household-wide shortlist and
 * visited state. A missing document means not shortlisted, not visited, version 0, but only
 * when the snapshot came from the server.
 */
export interface CollectionState {
  shortlisted: boolean;
  visited: boolean;
  visitedOn?: CalendarDate;
  updatedBy: string;
  updatedByName: string;
  updatedAt: Date;
  version: number;
}

/** Read model of households/{hid}/restaurants/{rid}/notes/{nid}. Personal notes, never evidence. */
export interface Note {
  id: string;
  text: string;
  authorUid: string;
  authorName: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}
```

Append to `web/src/records/validation.ts`:

```ts
export function validateNoteText(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed === "") return "Write something first.";
  if (trimmed.length > LIMITS.note) return tooLong(LIMITS.note);
  return null;
}

/** `today` is the device's local calendar day (useToday); the rules allow one day of slack. */
export function validateVisitedOn(value: string, today: CalendarDate): string | null {
  if (!isCalendarDate(value)) return "Enter the date of the visit.";
  if (compareCalendarDates(value, today) > 0) return "The visit date can't be in the future.";
  return null;
}
```

Create `web/src/records/collection.ts`:

```ts
import { collection, onSnapshot, serverTimestamp, Timestamp, type DocumentData, type DocumentSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { fromCalendarDate, toCalendarDate } from "./dates";
import { collectionRef, ConflictError, LISTEN, listenerFailure, NotFoundError, restaurantRef, toDate, write, type Snapshot, type WriteOutcome } from "./repository";
import type { Author, CalendarDate, CollectionState } from "./types";

/**
 * Shortlist and visited state (spec §3.7). One document per restaurant, id = restaurant id,
 * written whole by every change so the stored shape always matches the rules. Online-only
 * transactions via the repository's write() (spec §3.5).
 */

export function toCollectionState(snap: Pick<DocumentSnapshot, "data">): CollectionState {
  const d = snap.data() as DocumentData;
  const s: CollectionState = {
    shortlisted: d.shortlisted === true,
    visited: d.visited === true,
    updatedBy: String(d.updatedBy),
    updatedByName: String(d.updatedByName),
    updatedAt: toDate(d.updatedAt),
    version: Number(d.version),
  };
  if (d.visitedOn instanceof Timestamp) s.visitedOn = toCalendarDate(d.visitedOn);
  return s;
}

export function watchCollection(hid: string, cb: (s: Snapshot<Record<string, CollectionState>>) => void): () => void {
  return onSnapshot(
    collection(db, "households", hid, "collection"),
    LISTEN,
    (snap) => {
      const value: Record<string, CollectionState> = {};
      for (const d of snap.docs) value[d.id] = toCollectionState(d);
      cb({ status: snap.metadata.fromCache ? "offline" : "ready", value });
    },
    (err) => cb(listenerFailure(err)),
  );
}

export function watchCollectionEntry(hid: string, rid: string, cb: (s: Snapshot<CollectionState | null>) => void): () => void {
  return onSnapshot(
    collectionRef(hid, rid),
    LISTEN,
    (snap) => cb({ status: snap.metadata.fromCache ? "offline" : "ready", value: snap.exists() ? toCollectionState(snap) : null }),
    (err) => cb(listenerFailure(err)),
  );
}

interface StatePatch {
  shortlisted?: boolean;
  visitedOn?: CalendarDate | null;
}

function writeState(hid: string, rid: string, author: Author, baseVersion: number, patch: StatePatch): Promise<WriteOutcome<number>> {
  return write(async (tx) => {
    const parent = await tx.get(restaurantRef(hid, rid));
    if (!parent.exists() || (parent.data() as DocumentData).deleting === true) throw new NotFoundError();
    const ref = collectionRef(hid, rid);
    const snap = await tx.get(ref);
    const current = snap.exists() ? toCollectionState(snap) : null;
    const version = current?.version ?? 0;
    if (version !== baseVersion) throw new ConflictError();
    const shortlisted = patch.shortlisted ?? current?.shortlisted ?? false;
    const visitedOn = patch.visitedOn !== undefined ? patch.visitedOn : (current?.visitedOn ?? null);
    const data: DocumentData = {
      shortlisted,
      visited: visitedOn !== null,
      updatedBy: author.uid,
      updatedByName: author.displayName,
      updatedAt: serverTimestamp(),
      version: version + 1,
    };
    if (visitedOn !== null) data.visitedOn = fromCalendarDate(visitedOn);
    tx.set(ref, data);
    return version + 1;
  });
}

export function setShortlisted(hid: string, rid: string, author: Author, baseVersion: number, shortlisted: boolean): Promise<WriteOutcome<number>> {
  return writeState(hid, rid, author, baseVersion, { shortlisted });
}

/** `null` clears the visit. */
export function setVisited(hid: string, rid: string, author: Author, baseVersion: number, visitedOn: CalendarDate | null): Promise<WriteOutcome<number>> {
  return writeState(hid, rid, author, baseVersion, { visitedOn });
}
```

Create `web/src/records/notes.ts`:

```ts
import { doc, onSnapshot, orderBy, query, serverTimestamp, type DocumentData, type DocumentSnapshot } from "firebase/firestore";
import { ConflictError, LISTEN, listenerFailure, notesCol, NotFoundError, restaurantRef, toDate, write, type Snapshot, type WriteOutcome } from "./repository";
import type { Author, Note } from "./types";

/**
 * Authored notes on a restaurant (spec §3.7). Only the author edits or deletes (rules-enforced);
 * edits and deletes carry the version the member saw, so a change from another device surfaces
 * as a conflict instead of being overwritten. Callers pass validated, trimmed text.
 */

export function toNote(snap: Pick<DocumentSnapshot, "id" | "data">): Note {
  const d = snap.data() as DocumentData;
  return {
    id: snap.id,
    text: String(d.text),
    authorUid: String(d.authorUid),
    authorName: String(d.authorName),
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
    version: Number(d.version),
  };
}

export function watchNotes(hid: string, rid: string, cb: (s: Snapshot<Note[]>) => void): () => void {
  return onSnapshot(
    query(notesCol(hid, rid), orderBy("createdAt", "desc")),
    LISTEN,
    (snap) => cb({ status: snap.metadata.fromCache ? "offline" : "ready", value: snap.docs.map(toNote) }),
    (err) => cb(listenerFailure(err)),
  );
}

export function addNote(hid: string, rid: string, author: Author, text: string): Promise<WriteOutcome<string>> {
  return write(async (tx) => {
    const parent = await tx.get(restaurantRef(hid, rid));
    if (!parent.exists() || (parent.data() as DocumentData).deleting === true) throw new NotFoundError();
    const ref = doc(notesCol(hid, rid));
    tx.set(ref, { text, authorUid: author.uid, authorName: author.displayName, createdAt: serverTimestamp(), updatedAt: serverTimestamp(), version: 1 });
    return ref.id;
  });
}

export function updateNote(hid: string, rid: string, nid: string, baseVersion: number, text: string): Promise<WriteOutcome<number>> {
  return write(async (tx) => {
    const parent = await tx.get(restaurantRef(hid, rid));
    const snap = await tx.get(doc(notesCol(hid, rid), nid));
    if (!parent.exists() || (parent.data() as DocumentData).deleting === true || !snap.exists()) throw new NotFoundError();
    const current = toNote(snap);
    if (current.version !== baseVersion) throw new ConflictError();
    const next = baseVersion + 1;
    tx.update(snap.ref, { text, updatedAt: serverTimestamp(), version: next });
    return next;
  });
}

export function deleteNote(hid: string, rid: string, nid: string, baseVersion: number): Promise<WriteOutcome> {
  return write(async (tx) => {
    const snap = await tx.get(doc(notesCol(hid, rid), nid));
    if (!snap.exists()) throw new NotFoundError();
    if (toNote(snap).version !== baseVersion) throw new ConflictError();
    tx.delete(snap.ref);
  });
}
```

- [ ] **Step 6: Run the gates**

Run: `npm run typecheck && npm run test:unit` → PASS (previous + 2 validation + 8 collection + 6 notes).

- [ ] **Step 7: Commit**

```bash
git add web/src/records/types.ts web/src/records/validation.ts web/src/records/validation.test.ts web/src/records/collection.ts web/src/records/collection.test.ts web/src/records/notes.ts web/src/records/notes.test.ts
git commit -m "feat(records): shortlist/visited and notes data layer

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: Saved page — joined read state, Shortlist/All filter, labels, empty states, resume wording

**Files:**
- Create: `web/src/records/combine.ts`, `web/src/records/combine.test.ts`
- Create: `web/src/records/join.ts`, `web/src/records/join.test.ts`
- Modify: `web/src/records/messages.ts`, `web/src/records/messages.test.ts`
- Modify: `web/src/records/RestaurantsPage.tsx`, `web/src/records/RestaurantsPage.test.tsx`
- Modify: `web/src/styles.css`
- Modify: `web/e2e/records.spec.ts` (two list assertions now need *All records*)

**Interfaces:**
- Consumes: `watchRestaurants`, `finishDeleting` (`./repository`); `watchCollection` (`./collection`, Task 3); `WatchState` (`./useWatch`); `formatCalendarDate` (`./dates`); `deleteProgressText` (`./messages`, Task 2).
- Produces:
  - `combine.ts`: `isData<T>(s: WatchState<T>): s is Extract<WatchState<T>, { status: "ready" | "offline" }>`, `anyOffline(...states: Array<WatchState<unknown>>): boolean`, `combineStates<A, B>(a: WatchState<A>, b: WatchState<B>): WatchState<[A, B]>`
  - `join.ts`: `interface RecordRow { restaurant: Restaurant; state: CollectionState | null }`, `type RecordFilter = "shortlist" | "all"`, `joinRecords(restaurants, states): RecordRow[]`, `filterRows(rows, filter): RecordRow[]`
  - `messages.ts`: `finishOutcomeText(kind: WriteOutcome["kind"]): string`
  - Saved page testids (new): `filter-shortlist`, `filter-all` (`aria-pressed`), `label-shortlisted`, `label-visited`, `shortlist-empty`. Existing testids are kept.

- [ ] **Step 1: Write the failing pure-helper tests**

Create `web/src/records/combine.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { anyOffline, combineStates, isData } from "./combine";

describe("combineStates", () => {
  it("is loading until both listeners have produced a snapshot", () => {
    expect(combineStates({ status: "loading" }, { status: "ready", value: 1 })).toEqual({ status: "loading" });
    expect(combineStates({ status: "ready", value: 1 }, { status: "loading" })).toEqual({ status: "loading" });
  });

  it("never hides denied or an error behind other states, denied first", () => {
    expect(combineStates({ status: "error", message: "boom" }, { status: "denied" })).toEqual({ status: "denied" });
    expect(combineStates({ status: "offline", value: 1 }, { status: "error", message: "boom" })).toEqual({ status: "error", message: "boom" });
    expect(combineStates({ status: "loading" }, { status: "error", message: "boom" })).toEqual({ status: "error", message: "boom" });
  });

  it("is offline when either side is cache-backed, ready only when both are from the server", () => {
    expect(combineStates({ status: "offline", value: 1 }, { status: "ready", value: "a" })).toEqual({ status: "offline", value: [1, "a"] });
    expect(combineStates({ status: "ready", value: 1 }, { status: "ready", value: "a" })).toEqual({ status: "ready", value: [1, "a"] });
  });
});

describe("isData / anyOffline", () => {
  it("classify states", () => {
    expect(isData({ status: "offline", value: [] })).toBe(true);
    expect(isData({ status: "loading" })).toBe(false);
    expect(anyOffline({ status: "ready", value: 1 }, { status: "loading" })).toBe(false);
    expect(anyOffline({ status: "ready", value: 1 }, { status: "offline", value: 2 })).toBe(true);
  });
});
```

Create `web/src/records/join.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { filterRows, joinRecords } from "./join";
import type { CollectionState, Restaurant } from "./types";

const r = (id: string, deleting = false): Restaurant => ({ id, name: id, address: "x", createdBy: "ava-uid", createdAt: new Date(0), updatedAt: new Date(0), version: 1, deleting });
const s = (shortlisted: boolean): CollectionState => ({ shortlisted, visited: false, updatedBy: "ava-uid", updatedByName: "Ava", updatedAt: new Date(0), version: 1 });

describe("joinRecords / filterRows", () => {
  it("pairs each restaurant with its state by id, null when absent", () => {
    const rows = joinRecords([r("a"), r("b")], { a: s(true) });
    expect(rows).toEqual([{ restaurant: r("a"), state: s(true) }, { restaurant: r("b"), state: null }]);
  });

  it("the shortlist keeps shortlisted rows and every deleting row; all keeps everything", () => {
    const rows = joinRecords([r("a"), r("b"), r("c"), r("d", true)], { a: s(true), b: s(false) });
    expect(filterRows(rows, "shortlist").map((x) => x.restaurant.id)).toEqual(["a", "d"]);
    expect(filterRows(rows, "all").map((x) => x.restaurant.id)).toEqual(["a", "b", "c", "d"]);
  });
});
```

Append to `web/src/records/messages.test.ts` (merge `finishOutcomeText` into the import):

```ts
describe("finishOutcomeText", () => {
  it("tells the member what to do when resuming a deletion fails", () => {
    expect(finishOutcomeText("offline")).toBe("You are offline. Connect, then tap Finish deleting.");
    expect(finishOutcomeText("notFound")).toBe("Already removed.");
    expect(finishOutcomeText("permission")).toContain("That change was refused.");
    expect(finishOutcomeText("failed")).toBe("Could not finish deleting. Tap Finish deleting to try again.");
    expect(finishOutcomeText("conflict")).toBe("Could not finish deleting. Tap Finish deleting to try again.");
  });
});
```

- [ ] **Step 2: Write the failing page tests**

In `web/src/records/RestaurantsPage.test.tsx`:

(a) Extend the hoisted mocks and add the collection mock. Replace the `m` block, the `./repository` mock line and the `beforeEach` with:

```ts
const m = vi.hoisted(() => ({
  watchRestaurants: vi.fn(),
  watchCollection: vi.fn(),
  finishDeleting: vi.fn(),
  signOut: vi.fn(),
}));
vi.mock("./repository", () => ({ watchRestaurants: m.watchRestaurants, finishDeleting: m.finishDeleting }));
vi.mock("./collection", () => ({ watchCollection: m.watchCollection }));
```

```ts
let emit: (s: Snapshot<Restaurant[]>) => void = () => {};
let emitState: (s: Snapshot<Record<string, CollectionState>>) => void = () => {};
beforeEach(() => {
  m.watchRestaurants.mockImplementation((_hid: string, cb: (s: Snapshot<Restaurant[]>) => void) => {
    emit = cb;
    return () => {};
  });
  // Existing tests assume an authoritative, empty collection unless a test says otherwise.
  m.watchCollection.mockImplementation((_hid: string, cb: (s: Snapshot<Record<string, CollectionState>>) => void) => {
    emitState = cb;
    cb({ status: "ready", value: {} });
    return () => {};
  });
  m.finishDeleting.mockResolvedValue({ kind: "ok", value: undefined });
});
```

Import `CollectionState` next to `Restaurant` from `./types`.

(b) The existing test `"shows loading, then the household's restaurants as links"` now needs the *All records* filter because nothing is shortlisted. Insert `await userEvent.click(screen.getByTestId("filter-all"));` after the `act(() => emit(…))` line and make the test `async`. In `"disables Add while offline and shows the offline notice with the cached rows"`, add the same click (making it `async`) before asserting the row.

(c) The existing error test counts `watchRestaurants` re-subscriptions. Retry now re-subscribes both listeners, so it still gains exactly one `watchRestaurants` call. Leave it unchanged.

(d) Append:

```ts
const st = (over: Partial<CollectionState> = {}): CollectionState => ({ shortlisted: true, visited: false, updatedBy: "ava-uid", updatedByName: "Ava", updatedAt: new Date(), version: 1, ...over });

describe("RestaurantsPage — shortlist", () => {
  it("defaults to the shortlist with labels, and All records shows everything", async () => {
    renderPage();
    act(() => {
      emit({ status: "ready", value: [r({ id: "a", name: "Da Marco" }), r({ id: "b", name: "Zest" })] });
      emitState({ status: "ready", value: { a: st({ visited: true, visitedOn: "2026-05-03" }) } });
    });
    expect(screen.getByTestId("filter-shortlist")).toHaveAttribute("aria-pressed", "true");
    const rows = screen.getAllByTestId("restaurant-row");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toHaveTextContent("Da Marco");
    expect(screen.getByTestId("label-shortlisted")).toHaveTextContent("Shortlisted");
    expect(screen.getByTestId("label-visited")).toHaveTextContent("Visited 3 May 2026");
    await userEvent.click(screen.getByTestId("filter-all"));
    expect(screen.getAllByTestId("restaurant-row")).toHaveLength(2);
    expect(screen.getByTestId("filter-all")).toHaveAttribute("aria-pressed", "true");
  });

  it("distinguishes no records from an empty shortlist", () => {
    renderPage();
    act(() => emit({ status: "ready", value: [r({ id: "a", name: "Da Marco" })] }));
    expect(screen.getByTestId("shortlist-empty")).toHaveTextContent("Nothing on the shortlist. Open a record and tap Add to shortlist.");
    expect(screen.queryByTestId("restaurants-empty")).toBeNull();
    act(() => emit({ status: "ready", value: [] }));
    expect(screen.getByTestId("restaurants-empty")).toBeInTheDocument();
    expect(screen.queryByTestId("shortlist-empty")).toBeNull();
  });

  it("never shows an empty shortlist from a cached or failed collection snapshot", () => {
    renderPage();
    act(() => {
      emit({ status: "ready", value: [r({ id: "a", name: "Da Marco" })] });
      emitState({ status: "offline", value: {} });
    });
    expect(screen.queryByTestId("shortlist-empty")).toBeNull();
    expect(screen.getAllByTestId("read-offline")).toHaveLength(1);
    act(() => emitState({ status: "error", message: "boom" }));
    expect(screen.getByTestId("read-error")).toHaveTextContent("boom");
    expect(screen.queryByTestId("shortlist-empty")).toBeNull();
  });

  it("shows one offline notice when both listeners are cache-backed", () => {
    renderPage();
    act(() => {
      emit({ status: "offline", value: [r({ id: "a", name: "Da Marco" })] });
      emitState({ status: "offline", value: { a: st() } });
    });
    expect(screen.getAllByTestId("read-offline")).toHaveLength(1);
    expect(screen.getByTestId("restaurant-row")).toHaveTextContent("Da Marco");
  });

  it("keeps deleting rows under the shortlist filter", () => {
    renderPage();
    act(() => emit({ status: "ready", value: [r({ id: "d", name: "Doomed", deleting: true })] }));
    expect(screen.getByTestId("restaurant-deleting")).toHaveTextContent("Doomed");
  });

  it("explains a failed resume in words the member can act on", async () => {
    m.finishDeleting.mockResolvedValue({ kind: "failed", message: "x" });
    renderPage();
    act(() => emit({ status: "ready", value: [r({ id: "d", name: "Doomed", deleting: true })] }));
    await waitFor(() => expect(screen.getByTestId("restaurant-deleting")).toHaveTextContent("Could not finish deleting. Tap Finish deleting to try again."));
  });
});
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm --prefix web test -- combine join messages RestaurantsPage`
Expected: FAIL (modules missing; the page has no filter).

- [ ] **Step 4: Implement the helpers**

Create `web/src/records/combine.ts`:

```ts
import type { WatchState } from "./useWatch";

/**
 * Read states for views built from several listeners (spec §3.7 "Read states for joined data").
 * Precedence: denied, gone, error, loading, then offline if any side is cache-backed, else ready.
 * An error is never hidden behind the offline notice.
 */
export function isData<T>(s: WatchState<T>): s is Extract<WatchState<T>, { status: "ready" | "offline" }> {
  return s.status === "ready" || s.status === "offline";
}

export function anyOffline(...states: Array<WatchState<unknown>>): boolean {
  return states.some((s) => s.status === "offline");
}

export function combineStates<A, B>(a: WatchState<A>, b: WatchState<B>): WatchState<[A, B]> {
  if (a.status === "denied" || b.status === "denied") return { status: "denied" };
  if (a.status === "gone" || b.status === "gone") return { status: "gone" };
  if (a.status === "error") return { status: "error", message: a.message };
  if (b.status === "error") return { status: "error", message: b.message };
  if (!isData(a) || !isData(b)) return { status: "loading" };
  return { status: a.status === "offline" || b.status === "offline" ? "offline" : "ready", value: [a.value, b.value] };
}
```

Create `web/src/records/join.ts`:

```ts
import type { CollectionState, Restaurant } from "./types";

export interface RecordRow {
  restaurant: Restaurant;
  state: CollectionState | null;
}

export type RecordFilter = "shortlist" | "all";

export function joinRecords(restaurants: Restaurant[], states: Record<string, CollectionState>): RecordRow[] {
  return restaurants.map((restaurant) => ({ restaurant, state: states[restaurant.id] ?? null }));
}

/** Deleting rows stay under both filters so an interrupted deletion can always be finished. */
export function filterRows(rows: RecordRow[], filter: RecordFilter): RecordRow[] {
  if (filter === "all") return rows;
  return rows.filter((row) => row.restaurant.deleting || row.state?.shortlisted === true);
}
```

Append to `web/src/records/messages.ts`:

```ts
/** The Saved page's "Finish deleting" outcomes (the parked Plan 2b resume wording). */
export function finishOutcomeText(kind: WriteOutcome["kind"]): string {
  switch (kind) {
    case "ok": return "";
    case "offline": return "You are offline. Connect, then tap Finish deleting.";
    case "notFound": return "Already removed.";
    case "permission": return outcomeMessage("permission", "This restaurant");
    case "conflict":
    case "failed": return "Could not finish deleting. Tap Finish deleting to try again.";
  }
}
```

- [ ] **Step 5: Implement the page**

Replace `web/src/records/RestaurantsPage.tsx` with:

```tsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { watchCollection } from "./collection";
import { combineStates, isData } from "./combine";
import { formatCalendarDate } from "./dates";
import { filterRows, joinRecords, type RecordFilter } from "./join";
import { deleteProgressText, finishOutcomeText } from "./messages";
import { finishDeleting, watchRestaurants } from "./repository";
import { ReadStateNotice } from "./ReadStateNotice";
import type { CollectionState, Restaurant } from "./types";
import { useMember } from "./useMember";
import { useWatch } from "./useWatch";

export function RestaurantsPage() {
  const { householdId } = useMember();
  const restaurants = useWatch<Restaurant[]>((cb) => watchRestaurants(householdId, cb), [householdId]);
  const states = useWatch<Record<string, CollectionState>>((cb) => watchCollection(householdId, cb), [householdId]);
  const [filter, setFilter] = useState<RecordFilter>("shortlist");
  const [progress, setProgress] = useState<Record<string, string>>({});
  const resumed = useRef(new Set<string>());
  const combined = combineStates(restaurants.state, states.state);
  const offline = combined.status === "offline";
  const all = isData(combined) ? joinRecords(combined.value[0], combined.value[1]) : [];
  const rows = filterRows(all, filter);

  function retry() {
    restaurants.retry();
    states.retry();
  }

  async function finish(rid: string) {
    setProgress((p) => ({ ...p, [rid]: deleteProgressText("sweeping") }));
    const outcome = await finishDeleting(householdId, rid, (step) => setProgress((p) => ({ ...p, [rid]: deleteProgressText(step) })));
    if (outcome.kind !== "ok") setProgress((p) => ({ ...p, [rid]: finishOutcomeText(outcome.kind) }));
  }

  // Resume interrupted deletions once per mount from the authoritative restaurant list alone,
  // whatever the collection listener is doing (deletion protocol is resumable, spec §3.5/§3.7).
  const rs = restaurants.state;
  useEffect(() => {
    if (rs.status !== "ready") return;
    for (const r of rs.value) {
      if (r.deleting && !resumed.current.has(r.id)) {
        resumed.current.add(r.id);
        void finish(r.id);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rs]);

  return (
    <section>
      <h2>Saved</h2>
      <p>Our restaurant records.</p>
      <ReadStateNotice state={combined} onRetry={retry} />
      <p className="actions">
        <Link
          to="/restaurants/new"
          data-testid="add-restaurant"
          aria-disabled={offline ? "true" : undefined}
          onClick={(e) => { if (offline) e.preventDefault(); }}
          className={offline ? "disabled-link" : undefined}
        >
          Add restaurant
        </Link>
      </p>
      <p className="filter" role="group" aria-label="Show">
        <button type="button" data-testid="filter-shortlist" aria-pressed={filter === "shortlist"} onClick={() => setFilter("shortlist")}>Shortlist</button>
        <button type="button" data-testid="filter-all" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>All records</button>
      </p>
      {combined.status === "ready" && all.length === 0 && <p data-testid="restaurants-empty">No restaurants yet. Add the first one.</p>}
      {combined.status === "ready" && all.length > 0 && rows.length === 0 && (
        <p data-testid="shortlist-empty">Nothing on the shortlist. Open a record and tap Add to shortlist.</p>
      )}
      {rows.length > 0 && (
        <ul className="list" data-testid="restaurant-list">
          {rows.map(({ restaurant: r, state }) =>
            r.deleting ? (
              <li key={r.id} className="card" data-testid="restaurant-deleting" data-rid={r.id}>
                <strong>{r.name}</strong> — Deleting…
                <div className="actions">
                  <span>{progress[r.id]}</span>
                  <button type="button" data-testid="finish-deleting" disabled={offline} onClick={() => void finish(r.id)}>Finish deleting</button>
                </div>
              </li>
            ) : (
              <li key={r.id} className="card" data-testid="restaurant-row" data-rid={r.id}>
                <Link to={`/restaurants/${r.id}`}>
                  <strong>{r.name}</strong>
                  <br />
                  <span>{r.address}</span>
                  {state && (state.shortlisted || state.visitedOn) && (
                    <span className="labels">
                      {state.shortlisted && <span className="label" data-testid="label-shortlisted">Shortlisted</span>}
                      {state.visited && state.visitedOn && <span className="label" data-testid="label-visited">Visited {formatCalendarDate(state.visitedOn)}</span>}
                    </span>
                  )}
                </Link>
              </li>
            ),
          )}
        </ul>
      )}
    </section>
  );
}
```

Append to `web/src/styles.css`:

```css
.filter { display: flex; gap: 0.5rem; }
.filter button[aria-pressed="true"] { font-weight: 600; text-decoration: underline; }
.labels { display: flex; gap: 0.4rem; flex-wrap: wrap; margin-top: 0.3rem; }
.label { font-size: 0.8rem; border: 1px solid #8886; border-radius: 999px; padding: 0.05rem 0.5rem; }
```

- [ ] **Step 6: Update the two existing browser assertions**

The Saved tab now opens on the shortlist, and those two scenarios' records are not shortlisted. In `web/e2e/records.spec.ts`:
- In scenario 1, immediately before `await expect(page.getByTestId("restaurant-row")).toContainText("Da Marco");`, insert `await page.getByTestId("filter-all").click();`.
- In scenario 7, immediately before `await expect(page.getByTestId("restaurant-row")).toContainText("Ava's place");`, insert the same line.

Scenario 7's later `toHaveCount(0)` on the not-invited screen needs no change.

- [ ] **Step 7: Run the gates**

Run: `npm run typecheck && npm run test:unit` → PASS (previous + 4 combine + 2 join + 1 messages + 6 page).
Run: `npm run emu:e2e` → 29 PASS.

- [ ] **Step 8: Commit**

```bash
git add web/src/records/combine.ts web/src/records/combine.test.ts web/src/records/join.ts web/src/records/join.test.ts web/src/records/messages.ts web/src/records/messages.test.ts web/src/records/RestaurantsPage.tsx web/src/records/RestaurantsPage.test.tsx web/src/styles.css web/e2e/records.spec.ts
git commit -m "feat(saved): shortlist filter, visited labels and joined read states

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 5: Restaurant page — shortlist and visited status block, one offline notice

**Files:**
- Create: `web/src/records/StatusBlock.tsx`, `web/src/records/StatusBlock.test.tsx`
- Modify: `web/src/records/messages.ts`, `web/src/records/messages.test.ts`
- Modify: `web/src/records/RestaurantDetailPage.tsx`, `web/src/records/RestaurantDetailPage.test.tsx`

**Interfaces:**
- Consumes: `setShortlisted`, `setVisited`, `watchCollectionEntry` (`./collection`, Task 3); `isData`, `anyOffline` (`./combine`, Task 4); `validateVisitedOn` (Task 3); `useToday`, `formatCalendarDate`, `outcomeMessage`, `ReadStateNotice`.
- Produces:
  - `StatusBlock` props: `{ householdId: string; rid: string; author: Author; state: WatchState<CollectionState | null>; disabled: boolean; onRetry: () => void }`
  - testids: `status-block`, `shortlist-add`, `shortlist-state`, `shortlist-remove`, `visited-mark`, `visited-date`, `visited-save`, `visited-cancel`, `visited-error`, `visited-state`, `visited-change`, `visited-clear`, `status-changed-by`, `status-outcome` (`data-kind`)
  - `messages.ts`: `statusOutcomeMessage(kind: WriteOutcome["kind"]): string`
  - The detail page shows exactly one `read-offline` notice when any of its listeners is cache-backed.

Controls are enabled only when the collection snapshot is `ready` (server-backed), the page is not offline, and no write is in flight. A missing document is "not shortlisted, not visited", base version 0.

- [ ] **Step 1: Write the failing tests**

Append to `web/src/records/messages.test.ts` (merge `statusOutcomeMessage` into the import):

```ts
describe("statusOutcomeMessage", () => {
  it("explains a lost race without asking for a draft reload", () => {
    expect(statusOutcomeMessage("conflict")).toBe("Someone else changed this at the same moment. The current state is shown; try again if you still want the change.");
    expect(statusOutcomeMessage("notFound")).toBe("This restaurant was deleted.");
    expect(statusOutcomeMessage("offline")).toBe("You are offline. Connect and try again.");
  });
});
```

Create `web/src/records/StatusBlock.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CollectionState } from "./types";
import type { WatchState } from "./useWatch";

const m = vi.hoisted(() => ({ setShortlisted: vi.fn(), setVisited: vi.fn() }));
vi.mock("./collection", () => m);
vi.mock("./useToday", () => ({ useToday: () => "2026-09-24" }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));

import { StatusBlock } from "./StatusBlock";

const AVA = { uid: "ava-uid", displayName: "Ava" };
const st = (over: Partial<CollectionState> = {}): CollectionState => ({ shortlisted: false, visited: false, updatedBy: "bogdan-uid", updatedByName: "Bogdan", updatedAt: new Date(), version: 3, ...over });

function renderBlock(state: WatchState<CollectionState | null>, disabled = false) {
  return render(<StatusBlock householdId="home" rid="r1" author={AVA} state={state} disabled={disabled} onRetry={() => {}} />);
}

beforeEach(() => {
  m.setShortlisted.mockResolvedValue({ kind: "ok", value: 1 });
  m.setVisited.mockResolvedValue({ kind: "ok", value: 1 });
});
afterEach(() => vi.clearAllMocks());

describe("StatusBlock", () => {
  it("a missing document from the server means not shortlisted, not visited, base version 0", async () => {
    renderBlock({ status: "ready", value: null });
    expect(screen.queryByTestId("status-changed-by")).toBeNull();
    await userEvent.click(screen.getByTestId("shortlist-add"));
    expect(m.setShortlisted).toHaveBeenCalledWith("home", "r1", AVA, 0, true);
  });

  it("shows the stored state and who changed it last; Remove uses the stored version", async () => {
    renderBlock({ status: "ready", value: st({ shortlisted: true, visited: true, visitedOn: "2026-05-03" }) });
    expect(screen.getByTestId("shortlist-state")).toHaveTextContent("On shortlist");
    expect(screen.getByTestId("visited-state")).toHaveTextContent("Visited 3 May 2026");
    expect(screen.getByTestId("status-changed-by")).toHaveTextContent("Last changed by Bogdan");
    await userEvent.click(screen.getByTestId("shortlist-remove"));
    expect(m.setShortlisted).toHaveBeenCalledWith("home", "r1", AVA, 3, false);
  });

  it("Mark visited defaults to today, refuses a future date, and saves a past one", async () => {
    renderBlock({ status: "ready", value: st() });
    await userEvent.click(screen.getByTestId("visited-mark"));
    const input = screen.getByTestId("visited-date");
    expect(input).toHaveValue("2026-09-24");
    // jsdom sanitises partial date strings, so set the whole value at once.
    fireEvent.change(input, { target: { value: "2026-09-30" } });
    await userEvent.click(screen.getByTestId("visited-save"));
    expect(screen.getByTestId("visited-error")).toHaveTextContent("The visit date can't be in the future.");
    expect(m.setVisited).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: "2026-09-20" } });
    await userEvent.click(screen.getByTestId("visited-save"));
    expect(m.setVisited).toHaveBeenCalledWith("home", "r1", AVA, 3, "2026-09-20");
    await waitFor(() => expect(screen.queryByTestId("visited-date")).toBeNull());
  });

  it("Change date starts from the stored date; Clear sends null", async () => {
    renderBlock({ status: "ready", value: st({ visited: true, visitedOn: "2026-05-03" }) });
    await userEvent.click(screen.getByTestId("visited-change"));
    expect(screen.getByTestId("visited-date")).toHaveValue("2026-05-03");
    await userEvent.click(screen.getByTestId("visited-cancel"));
    await userEvent.click(screen.getByTestId("visited-clear"));
    expect(m.setVisited).toHaveBeenCalledWith("home", "r1", AVA, 3, null);
  });

  it("a conflict shows the standard message and never retries by itself", async () => {
    m.setShortlisted.mockResolvedValue({ kind: "conflict" });
    renderBlock({ status: "ready", value: null });
    await userEvent.click(screen.getByTestId("shortlist-add"));
    await waitFor(() => expect(screen.getByTestId("status-outcome")).toHaveAttribute("data-kind", "conflict"));
    expect(m.setShortlisted).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["cached", { status: "offline", value: null } as const, false],
    ["from a page that is offline", { status: "ready", value: null } as const, true],
  ])("disables every control when the state is %s", (_label, state, disabled) => {
    renderBlock(state, disabled);
    expect(screen.getByTestId("shortlist-add")).toBeDisabled();
    expect(screen.getByTestId("visited-mark")).toBeDisabled();
  });

  it("shows loading and errors instead of controls until the state is known", () => {
    renderBlock({ status: "loading" });
    expect(screen.queryByTestId("shortlist-add")).toBeNull();
    expect(screen.getByTestId("read-loading")).toBeInTheDocument();
    renderBlock({ status: "error", message: "boom" });
    expect(screen.getByTestId("read-error")).toHaveTextContent("boom");
  });
});
```

In `web/src/records/RestaurantDetailPage.test.tsx`:

(a) Add the collection mock and emitter. Change the hoisted mocks to include `watchCollectionEntry: vi.fn(), setShortlisted: vi.fn(), setVisited: vi.fn()`. Keep `vi.mock("./repository", () => m)` and add `vi.mock("./collection", () => m);`. Add

```ts
let emitState: (s: Snapshot<CollectionState | null>) => void = () => {};
```

to the emitters. In `beforeEach` add the following. Existing tests assume an authoritative "nothing stored" state:

```ts
  m.watchCollectionEntry.mockImplementation((_h: string, _r: string, cb: (s: Snapshot<CollectionState | null>) => void) => {
    emitState = cb;
    cb({ status: "ready", value: null });
    return () => {};
  });
```

Import `CollectionState` from `./types`.

(b) Append:

```ts
describe("RestaurantDetailPage — status block", () => {
  it("renders the status block with the stored state", () => {
    renderPage();
    act(() => {
      emitRestaurant({ status: "ready", value: restaurant });
      emitClaims({ status: "ready", value: [] });
      emitState({ status: "ready", value: { shortlisted: true, visited: false, updatedBy: "bogdan-uid", updatedByName: "Bogdan", updatedAt: new Date(), version: 2 } });
    });
    expect(screen.getByTestId("shortlist-state")).toHaveTextContent("On shortlist");
  });

  it("shows one offline notice when only the collection state is cached", () => {
    renderPage();
    act(() => {
      emitRestaurant({ status: "ready", value: restaurant });
      emitClaims({ status: "ready", value: [] });
      emitState({ status: "offline", value: null });
    });
    expect(screen.getAllByTestId("read-offline")).toHaveLength(1);
    expect(screen.getByTestId("shortlist-add")).toBeDisabled();
    expect(screen.getByTestId("add-evidence")).toHaveAttribute("aria-disabled", "true");
  });

  it("shows a collection error in the status block without hiding the evidence", () => {
    renderPage();
    act(() => {
      emitRestaurant({ status: "ready", value: restaurant });
      emitClaims({ status: "ready", value: [] });
      emitState({ status: "error", message: "boom" });
    });
    expect(screen.getByTestId("status-block")).toHaveTextContent("boom");
    expect(screen.getByTestId("evidence-gfMenu")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix web test -- messages StatusBlock RestaurantDetailPage`
Expected: FAIL (`StatusBlock`, `statusOutcomeMessage` missing; the page has no status block).

- [ ] **Step 3: Implement**

Append to `web/src/records/messages.ts`:

```ts
/** Shortlist/visited writes: there is no draft to reload, the live state is already on screen. */
export function statusOutcomeMessage(kind: WriteOutcome["kind"]): string {
  switch (kind) {
    case "conflict": return "Someone else changed this at the same moment. The current state is shown; try again if you still want the change.";
    case "notFound": return "This restaurant was deleted.";
    default: return outcomeMessage(kind, "This change");
  }
}
```

Create `web/src/records/StatusBlock.tsx`:

```tsx
import { useState } from "react";
import { setShortlisted, setVisited } from "./collection";
import { isData } from "./combine";
import { formatCalendarDate } from "./dates";
import { statusOutcomeMessage } from "./messages";
import { ReadStateNotice } from "./ReadStateNotice";
import type { WriteOutcome } from "./repository";
import type { Author, CollectionState } from "./types";
import { useToday } from "./useToday";
import type { WatchState } from "./useWatch";
import { validateVisitedOn } from "./validation";

interface Props {
  householdId: string;
  rid: string;
  author: Author;
  state: WatchState<CollectionState | null>;
  /** True when any listener on the page is cache-backed: writes need a connection. */
  disabled: boolean;
  onRetry: () => void;
}

/**
 * Household shortlist and visited state for one restaurant (spec §3.7). Never computes or shows
 * anything safety-related; visiting touches only the collection document.
 */
export function StatusBlock({ householdId, rid, author, state, disabled, onRetry }: Props) {
  const today = useToday();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<WriteOutcome["kind"] | null>(null);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [dateError, setDateError] = useState<string | null>(null);

  if (!isData(state)) {
    return (
      <section className="status" data-testid="status-block">
        <ReadStateNotice state={state} onRetry={onRetry} />
      </section>
    );
  }

  const current = state.value;
  // A missing or cached document is only a safe base when it came from the server.
  const locked = disabled || busy || state.status !== "ready";
  const base = current?.version ?? 0;

  async function run(action: () => Promise<WriteOutcome<number>>): Promise<boolean> {
    setBusy(true);
    setOutcome(null);
    const result = await action();
    setBusy(false);
    if (result.kind !== "ok") setOutcome(result.kind);
    return result.kind === "ok";
  }

  async function saveDate() {
    if (editingDate === null) return;
    const problem = validateVisitedOn(editingDate, today);
    setDateError(problem);
    if (problem) return;
    if (await run(() => setVisited(householdId, rid, author, base, editingDate))) setEditingDate(null);
  }

  return (
    <section className="status" data-testid="status-block">
      <p className="actions">
        {current?.shortlisted ? (
          <>
            <span data-testid="shortlist-state">On shortlist</span>
            <button type="button" data-testid="shortlist-remove" disabled={locked} onClick={() => void run(() => setShortlisted(householdId, rid, author, base, false))}>Remove</button>
          </>
        ) : (
          <button type="button" data-testid="shortlist-add" disabled={locked} onClick={() => void run(() => setShortlisted(householdId, rid, author, base, true))}>Add to shortlist</button>
        )}
      </p>
      <p className="actions">
        {editingDate === null && current?.visited && current.visitedOn && (
          <>
            <span data-testid="visited-state">Visited {formatCalendarDate(current.visitedOn)}</span>
            <button type="button" data-testid="visited-change" disabled={locked} onClick={() => { setEditingDate(current.visitedOn ?? today); setDateError(null); }}>Change date</button>
            <button type="button" data-testid="visited-clear" disabled={locked} onClick={() => void run(() => setVisited(householdId, rid, author, base, null))}>Clear</button>
          </>
        )}
        {editingDate === null && !current?.visited && (
          <button type="button" data-testid="visited-mark" disabled={locked} onClick={() => { setEditingDate(today); setDateError(null); }}>Mark visited</button>
        )}
        {editingDate !== null && (
          <>
            <label>
              Visit date
              <input type="date" data-testid="visited-date" value={editingDate} max={today} onChange={(e) => setEditingDate(e.target.value)} />
            </label>
            <button type="button" data-testid="visited-save" disabled={locked} onClick={() => void saveDate()}>Save</button>
            <button type="button" data-testid="visited-cancel" disabled={busy} onClick={() => { setEditingDate(null); setDateError(null); }}>Cancel</button>
            {dateError && <span className="field-error" data-testid="visited-error">{dateError}</span>}
          </>
        )}
      </p>
      {current && <p className="hint" data-testid="status-changed-by">Last changed by {current.updatedByName}</p>}
      {outcome && <p role="alert" data-testid="status-outcome" data-kind={outcome}>{statusOutcomeMessage(outcome)}</p>}
    </section>
  );
}
```

In `web/src/records/RestaurantDetailPage.tsx`:

(a) Add imports:

```ts
import { watchCollectionEntry } from "./collection";
import { anyOffline, isData } from "./combine";
import { StatusBlock } from "./StatusBlock";
```

and change the types import to include `CollectionState`.

(b) In `RestaurantDetailPage`, take `uid` and `displayName` from `useMember()` (`const { householdId, uid, displayName } = useMember();`). After `claimsWatch` add:

```ts
  const stateWatch = useWatch<CollectionState | null>((cb) => watchCollectionEntry(householdId, rid!, cb), [householdId, rid]);
```

(c) Replace the lines from `const restaurant = rs.value;` through `const claimsReady = …;` (keeping `onDeleteClaim`) with:

```ts
  const restaurant = rs.value;
  const ss = stateWatch.state;
  // One notice for every cache-backed listener on the page (spec §3.7); writes need the server.
  const offline = anyOffline(rs, cs, ss);
  const claimsReady = isData(cs);
  const claims = claimsReady ? cs.value : [];
  const summary = summariseEvidence(claims, today);
```

Keep `async function onDeleteClaim` unchanged. Remove the now-duplicated earlier `offline`, `claims` and `claimsReady` declarations.

(d) In the JSX, replace the first `<ReadStateNotice state={rs} onRetry={restaurantWatch.retry} />` with:

```tsx
      {offline && <ReadStateNotice state={{ status: "offline", value: null }} onRetry={restaurantWatch.retry} />}
```

and replace `{(!claimsReady || (cs.status === "offline" && rs.status !== "offline")) && <ReadStateNotice state={cs} onRetry={claimsWatch.retry} />}` with:

```tsx
      {!claimsReady && <ReadStateNotice state={cs} onRetry={claimsWatch.retry} />}
```

(e) Directly after the `<p className="actions">…</p>` with the phone/website/maps/edit links, before `<h3>Evidence</h3>`, insert:

```tsx
      <StatusBlock householdId={householdId} rid={restaurant.id} author={{ uid, displayName }} state={ss} disabled={offline} onRetry={stateWatch.retry} />
```

- [ ] **Step 4: Run the gates**

Run: `npm run typecheck && npm run test:unit` → PASS (previous + 1 messages + 8 StatusBlock (7 tests, one `it.each` with two rows) + 3 detail page). The existing detail-page offline-notice matrix (6 rows) still passes: exactly one `read-offline`.

- [ ] **Step 5: Commit**

```bash
git add web/src/records/StatusBlock.tsx web/src/records/StatusBlock.test.tsx web/src/records/messages.ts web/src/records/messages.test.ts web/src/records/RestaurantDetailPage.tsx web/src/records/RestaurantDetailPage.test.tsx
git commit -m "feat(records): shortlist and visited controls on the restaurant page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 6: Notes on the restaurant page; deletion wording in the form

**Files:**
- Create: `web/src/records/NotesSection.tsx`, `web/src/records/NotesSection.test.tsx`
- Modify: `web/src/records/RestaurantDetailPage.tsx`, `web/src/records/RestaurantDetailPage.test.tsx`
- Modify: `web/src/records/RestaurantFormPage.tsx`, `web/src/records/RestaurantFormPage.test.tsx`
- Modify: `web/src/styles.css`

**Interfaces:**
- Consumes: `watchNotes`, `addNote`, `updateNote`, `deleteNote` (`./notes`, Task 3); `validateNoteText`, `LIMITS` (Task 3/1); `isData`, `anyOffline` (Task 4); `outcomeMessage`.
- Produces:
  - `NotesSection` props: `{ householdId: string; rid: string; author: Author; state: WatchState<Note[]>; disabled: boolean; onRetry: () => void }`
  - testids: `notes-section`, `notes-empty`, `note-add-text`, `note-add-counter`, `note-add-save`, `note-add-error`, `note-add-outcome`; per note `note-{id}` (`data-version`), `note-edited-{id}`, `note-edit-{id}`, `note-edit-text-{id}`, `note-save-{id}`, `note-cancel-{id}`, `note-error-{id}`, `note-conflict-{id}`, `note-conflict-current-{id}`, `note-keep-mine-{id}`, `note-use-theirs-{id}`, `note-delete-{id}`, `note-delete-confirm-{id}`, `note-delete-cancel-{id}`, `note-outcome-{id}` (`data-kind`)
  - Form: the delete confirmation reads "Deletes the restaurant, its evidence, and both members' notes." A failed delete uses the delete verb.

Rules for the UI (spec §3.7):
- Edit and Delete appear only on the caller's own notes.
- A pending delete confirmation is bound to the note's id and version. It resets when that note changes.
- A failed add or save keeps the draft.
- An edit conflict shows the current server text beside the draft. "Keep mine" writes with the version shown; "Use theirs" drops the draft.

- [ ] **Step 1: Write the failing `NotesSection` tests**

Create `web/src/records/NotesSection.test.tsx`:

```tsx
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Note } from "./types";
import type { WatchState } from "./useWatch";

const m = vi.hoisted(() => ({ addNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn() }));
vi.mock("./notes", () => m);
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ signOut: vi.fn() }) }));

import { NotesSection } from "./NotesSection";

const AVA = { uid: "ava-uid", displayName: "Ava" };
const note = (over: Partial<Note> & Pick<Note, "id">): Note => ({ text: "Staff were careful", authorUid: "ava-uid", authorName: "Ava", createdAt: new Date("2026-09-01T10:00:00Z"), updatedAt: new Date("2026-09-01T10:00:00Z"), version: 1, ...over });

function renderSection(state: WatchState<Note[]>, disabled = false) {
  const view = render(<NotesSection householdId="home" rid="r1" author={AVA} state={state} disabled={disabled} onRetry={() => {}} />);
  return {
    ...view,
    update: (next: WatchState<Note[]>) => view.rerender(<NotesSection householdId="home" rid="r1" author={AVA} state={next} disabled={disabled} onRetry={() => {}} />),
  };
}

beforeEach(() => {
  m.addNote.mockResolvedValue({ kind: "ok", value: "new" });
  m.updateNote.mockResolvedValue({ kind: "ok", value: 2 });
  m.deleteNote.mockResolvedValue({ kind: "ok", value: undefined });
});
afterEach(() => vi.clearAllMocks());

describe("NotesSection", () => {
  it("says notes are not evidence, lists notes with authors, and offers controls only on the member's own", () => {
    renderSection({ status: "ready", value: [note({ id: "a" }), note({ id: "b", authorUid: "bogdan-uid", authorName: "Bogdan", version: 2 })] });
    expect(screen.getByTestId("notes-section")).toHaveTextContent("Personal notes. They are not evidence and don't change any checked date.");
    expect(screen.getByTestId("note-b")).toHaveTextContent("Bogdan");
    expect(screen.getByTestId("note-edited-b")).toBeInTheDocument();
    expect(screen.queryByTestId("note-edited-a")).toBeNull();
    expect(screen.getByTestId("note-edit-a")).toBeInTheDocument();
    expect(screen.queryByTestId("note-edit-b")).toBeNull();
    expect(screen.queryByTestId("note-delete-b")).toBeNull();
  });

  it("shows the empty state only from the server", () => {
    const view = renderSection({ status: "offline", value: [] });
    expect(screen.queryByTestId("notes-empty")).toBeNull();
    view.update({ status: "ready", value: [] });
    expect(screen.getByTestId("notes-empty")).toHaveTextContent("No notes yet.");
  });

  it("adds a trimmed note, refuses blank text, and keeps the draft when saving fails", async () => {
    renderSection({ status: "ready", value: [] });
    await userEvent.click(screen.getByTestId("note-add-save"));
    expect(screen.getByTestId("note-add-error")).toHaveTextContent("Write something first.");
    expect(m.addNote).not.toHaveBeenCalled();
    await userEvent.type(screen.getByTestId("note-add-text"), "  Asked about the fryer  ");
    expect(screen.getByTestId("note-add-counter")).toHaveTextContent("21 / 2000");
    m.addNote.mockResolvedValueOnce({ kind: "offline" });
    await userEvent.click(screen.getByTestId("note-add-save"));
    await waitFor(() => expect(screen.getByTestId("note-add-outcome")).toHaveAttribute("data-kind", "offline"));
    expect(screen.getByTestId("note-add-text")).toHaveValue("  Asked about the fryer  ");
    await userEvent.click(screen.getByTestId("note-add-save"));
    expect(m.addNote).toHaveBeenLastCalledWith("home", "r1", AVA, "Asked about the fryer");
    await waitFor(() => expect(screen.getByTestId("note-add-text")).toHaveValue(""));
  });

  it("edits with the version the member started from", async () => {
    renderSection({ status: "ready", value: [note({ id: "a", version: 4 })] });
    await userEvent.click(screen.getByTestId("note-edit-a"));
    const box = screen.getByTestId("note-edit-text-a");
    await userEvent.clear(box);
    await userEvent.type(box, "Went back, still careful");
    await userEvent.click(screen.getByTestId("note-save-a"));
    expect(m.updateNote).toHaveBeenCalledWith("home", "r1", "a", 4, "Went back, still careful");
    await waitFor(() => expect(screen.queryByTestId("note-edit-text-a")).toBeNull());
  });

  it("an edit conflict shows the current text beside the draft; Keep mine writes with the version shown", async () => {
    const view = renderSection({ status: "ready", value: [note({ id: "a", version: 1 })] });
    await userEvent.click(screen.getByTestId("note-edit-a"));
    await userEvent.clear(screen.getByTestId("note-edit-text-a"));
    await userEvent.type(screen.getByTestId("note-edit-text-a"), "My draft");
    view.update({ status: "ready", value: [note({ id: "a", version: 2, text: "Changed on the phone" })] });
    m.updateNote.mockResolvedValueOnce({ kind: "conflict" });
    await userEvent.click(screen.getByTestId("note-save-a"));
    await waitFor(() => expect(screen.getByTestId("note-conflict-a")).toBeInTheDocument());
    expect(screen.getByTestId("note-conflict-current-a")).toHaveTextContent("Changed on the phone");
    expect(screen.getByTestId("note-edit-text-a")).toHaveValue("My draft");
    await userEvent.click(screen.getByTestId("note-keep-mine-a"));
    expect(m.updateNote).toHaveBeenLastCalledWith("home", "r1", "a", 2, "My draft");
  });

  it("Use theirs drops the draft", async () => {
    const view = renderSection({ status: "ready", value: [note({ id: "a" })] });
    await userEvent.click(screen.getByTestId("note-edit-a"));
    view.update({ status: "ready", value: [note({ id: "a", version: 2, text: "Theirs" })] });
    m.updateNote.mockResolvedValueOnce({ kind: "conflict" });
    await userEvent.click(screen.getByTestId("note-save-a"));
    await userEvent.click(await screen.findByTestId("note-use-theirs-a"));
    expect(screen.queryByTestId("note-edit-text-a")).toBeNull();
    expect(screen.getByTestId("note-a")).toHaveTextContent("Theirs");
  });

  it("delete needs a confirmation bound to the version shown, and deletes that version", async () => {
    const view = renderSection({ status: "ready", value: [note({ id: "a", version: 1 })] });
    await userEvent.click(screen.getByTestId("note-delete-a"));
    expect(m.deleteNote).not.toHaveBeenCalled();
    act(() => view.update({ status: "ready", value: [note({ id: "a", version: 2, text: "Edited elsewhere" })] }));
    expect(screen.queryByTestId("note-delete-confirm-a")).toBeNull();
    await userEvent.click(screen.getByTestId("note-delete-a"));
    await userEvent.click(screen.getByTestId("note-delete-confirm-a"));
    expect(m.deleteNote).toHaveBeenCalledWith("home", "r1", "a", 2);
  });

  it("disables adding, editing and deleting while the page is offline", () => {
    renderSection({ status: "offline", value: [note({ id: "a" })] }, true);
    expect(screen.getByTestId("note-add-save")).toBeDisabled();
    expect(screen.getByTestId("note-edit-a")).toBeDisabled();
    expect(screen.getByTestId("note-delete-a")).toBeDisabled();
  });

  it("shows loading and errors from the notes listener", () => {
    renderSection({ status: "error", message: "boom" });
    expect(screen.getByTestId("read-error")).toHaveTextContent("boom");
  });
});
```

- [ ] **Step 2: Write the failing page and form tests**

In `web/src/records/RestaurantDetailPage.test.tsx`: add `watchNotes: vi.fn(), addNote: vi.fn(), updateNote: vi.fn(), deleteNote: vi.fn()` to the hoisted `m`, add `vi.mock("./notes", () => m);`, and add an emitter plus a `beforeEach` default (an authoritative empty list):

```ts
let emitNotes: (s: Snapshot<Note[]>) => void = () => {};
```

```ts
  m.watchNotes.mockImplementation((_h: string, _r: string, cb: (s: Snapshot<Note[]>) => void) => {
    emitNotes = cb;
    cb({ status: "ready", value: [] });
    return () => {};
  });
```

Import `Note` from `./types`. Append:

```ts
describe("RestaurantDetailPage — notes", () => {
  it("places notes between the evidence and the call-ahead prompts", () => {
    renderPage();
    act(() => {
      emitRestaurant({ status: "ready", value: restaurant });
      emitClaims({ status: "ready", value: [] });
      emitNotes({ status: "ready", value: [{ id: "n1", text: "Asked twice, confident answers", authorUid: "bogdan-uid", authorName: "Bogdan", createdAt: new Date(), updatedAt: new Date(), version: 1 }] });
    });
    const notes = screen.getByTestId("notes-section");
    expect(notes).toHaveTextContent("Asked twice, confident answers");
    const evidence = screen.getByTestId("evidence-gfMenu");
    const callAhead = screen.getByTestId("call-ahead");
    expect(evidence.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notes.compareDocumentPosition(callAhead) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("counts cached notes in the single offline notice", () => {
    renderPage();
    act(() => {
      emitRestaurant({ status: "ready", value: restaurant });
      emitClaims({ status: "ready", value: [] });
      emitNotes({ status: "offline", value: [] });
    });
    expect(screen.getAllByTestId("read-offline")).toHaveLength(1);
    expect(screen.getByTestId("note-add-save")).toBeDisabled();
  });
});
```

In `web/src/records/RestaurantFormPage.test.tsx`, append inside the existing top-level `describe` that holds the delete tests:

```ts
  it("names notes in the delete confirmation and reports a failed delete with the delete verb", async () => {
    m.deleteRestaurant.mockResolvedValue({ kind: "failed", message: "x" });
    renderAt("/restaurants/r1/edit");
    act(() => emit({ status: "ready", value: stored }));
    await userEvent.click(screen.getByTestId("delete-restaurant"));
    expect(screen.getByTestId("delete-question")).toHaveTextContent("Deletes the restaurant, its evidence, and both members' notes.");
    await userEvent.click(screen.getByTestId("delete-confirm"));
    await waitFor(() => expect(screen.getByTestId("save-outcome")).toHaveTextContent("Could not delete this restaurant. Try again."));
  });
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm --prefix web test -- NotesSection RestaurantDetailPage RestaurantFormPage`
Expected: FAIL.

- [ ] **Step 4: Implement `NotesSection`**

Create `web/src/records/NotesSection.tsx`:

```tsx
import { useState } from "react";
import { isData } from "./combine";
import { outcomeMessage } from "./messages";
import { addNote, deleteNote, updateNote } from "./notes";
import { ReadStateNotice } from "./ReadStateNotice";
import type { WriteOutcome } from "./repository";
import type { Author, Note } from "./types";
import type { WatchState } from "./useWatch";
import { LIMITS, validateNoteText } from "./validation";

interface Props {
  householdId: string;
  rid: string;
  author: Author;
  state: WatchState<Note[]>;
  /** True when any listener on the page is cache-backed: writes need a connection. */
  disabled: boolean;
  onRetry: () => void;
}

const DATE = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" });

function noteMessage(kind: WriteOutcome["kind"], adding: boolean): string {
  if (kind === "notFound") return adding ? "This restaurant was deleted." : "This note was deleted.";
  if (kind === "conflict") return "This note changed on another device.";
  return outcomeMessage(kind, "This note");
}

/** Personal notes (spec §3.7). Never evidence: no kinds, no dates that feed evidence status. */
export function NotesSection({ householdId, rid, author, state, disabled, onRetry }: Props) {
  return (
    <section className="notes" data-testid="notes-section">
      <h3>Our notes</h3>
      <p className="hint">Personal notes. They are not evidence and don't change any checked date.</p>
      {!isData(state) && <ReadStateNotice state={state} onRetry={onRetry} />}
      <NoteComposer householdId={householdId} rid={rid} author={author} disabled={disabled} />
      {state.status === "ready" && state.value.length === 0 && <p data-testid="notes-empty">No notes yet.</p>}
      {isData(state) &&
        state.value.map((n) => (
          <NoteCard key={n.id} householdId={householdId} rid={rid} note={n} own={n.authorUid === author.uid} disabled={disabled} />
        ))}
    </section>
  );
}

function NoteComposer({ householdId, rid, author, disabled }: { householdId: string; rid: string; author: Author; disabled: boolean }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<WriteOutcome["kind"] | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const problem = validateNoteText(text);
    setError(problem);
    setOutcome(null);
    if (problem) return;
    setBusy(true);
    const result = await addNote(householdId, rid, author, text.trim());
    setBusy(false);
    if (result.kind === "ok") {
      setText("");
      return;
    }
    setOutcome(result.kind); // the draft stays in the box
  }

  return (
    <div className="note-composer">
      <label>
        Add a note
        <textarea data-testid="note-add-text" value={text} rows={3} onChange={(e) => setText(e.target.value)} />
      </label>
      <span className="hint" data-testid="note-add-counter">{text.trim().length} / {LIMITS.note}</span>
      <button type="button" data-testid="note-add-save" disabled={disabled || busy} onClick={() => void save()}>{busy ? "Saving…" : "Save note"}</button>
      {error && <span className="field-error" data-testid="note-add-error">{error}</span>}
      {outcome && <p role="alert" data-testid="note-add-outcome" data-kind={outcome}>{noteMessage(outcome, true)}</p>}
    </div>
  );
}

function NoteCard({ householdId, rid, note, own, disabled }: { householdId: string; rid: string; note: Note; own: boolean; disabled: boolean }) {
  const [editing, setEditing] = useState<{ draft: string; baseVersion: number } | null>(null);
  const [conflict, setConflict] = useState(false);
  // The version a pending delete confirmation belongs to (audit clarification, as claims in 37cc46b).
  const [confirming, setConfirming] = useState<number | null>(null);
  const [outcome, setOutcome] = useState<WriteOutcome["kind"] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (confirming !== null && confirming !== note.version) setConfirming(null);

  async function save(baseVersion: number) {
    if (!editing) return;
    const problem = validateNoteText(editing.draft);
    setError(problem);
    setOutcome(null);
    if (problem) return;
    setBusy(true);
    const result = await updateNote(householdId, rid, note.id, baseVersion, editing.draft.trim());
    setBusy(false);
    if (result.kind === "ok") {
      setEditing(null);
      setConflict(false);
      return;
    }
    if (result.kind === "conflict") {
      setConflict(true);
      return;
    }
    setOutcome(result.kind); // the draft stays open
  }

  async function confirmDelete() {
    if (confirming === null) return;
    setBusy(true);
    const result = await deleteNote(householdId, rid, note.id, confirming);
    setBusy(false);
    if (result.kind !== "ok") {
      setConfirming(null);
      setOutcome(result.kind);
    }
  }

  function stopEditing() {
    setEditing(null);
    setConflict(false);
    setError(null);
  }

  return (
    <article className="card note" data-testid={`note-${note.id}`} data-version={note.version}>
      {!editing && <p className="note-text">{note.text}</p>}
      <p className="hint">
        {note.authorName} · {DATE.format(note.createdAt)}
        {note.version > 1 && <span data-testid={`note-edited-${note.id}`}> · edited</span>}
      </p>
      {editing && (
        <div className="note-editor">
          <textarea data-testid={`note-edit-text-${note.id}`} value={editing.draft} rows={3} onChange={(e) => setEditing({ ...editing, draft: e.target.value })} />
          {conflict ? (
            <div className="notice" role="status" data-testid={`note-conflict-${note.id}`}>
              <p>This note changed on another device. It now reads:</p>
              <blockquote data-testid={`note-conflict-current-${note.id}`}>{note.text}</blockquote>
              <div className="actions">
                <button type="button" data-testid={`note-keep-mine-${note.id}`} disabled={disabled || busy} onClick={() => void save(note.version)}>Keep mine</button>
                <button type="button" data-testid={`note-use-theirs-${note.id}`} disabled={busy} onClick={stopEditing}>Use theirs</button>
              </div>
            </div>
          ) : (
            <div className="actions">
              <button type="button" data-testid={`note-save-${note.id}`} disabled={disabled || busy} onClick={() => void save(editing.baseVersion)}>Save</button>
              <button type="button" data-testid={`note-cancel-${note.id}`} disabled={busy} onClick={stopEditing}>Cancel</button>
            </div>
          )}
          {error && <span className="field-error" data-testid={`note-error-${note.id}`}>{error}</span>}
        </div>
      )}
      {own && !editing && (
        <div className="actions">
          {confirming === null ? (
            <>
              <button type="button" data-testid={`note-edit-${note.id}`} disabled={disabled} onClick={() => { setEditing({ draft: note.text, baseVersion: note.version }); setOutcome(null); }}>Edit</button>
              <button type="button" data-testid={`note-delete-${note.id}`} disabled={disabled} onClick={() => { setConfirming(note.version); setOutcome(null); }}>Delete</button>
            </>
          ) : (
            <>
              <span>Delete this note?</span>
              <button type="button" data-testid={`note-delete-confirm-${note.id}`} disabled={disabled || busy} onClick={() => void confirmDelete()}>Yes, delete</button>
              <button type="button" data-testid={`note-delete-cancel-${note.id}`} disabled={busy} onClick={() => setConfirming(null)}>Cancel</button>
            </>
          )}
        </div>
      )}
      {outcome && <p role="alert" data-testid={`note-outcome-${note.id}`} data-kind={outcome}>{noteMessage(outcome, false)}</p>}
    </article>
  );
}
```

Append to `web/src/styles.css`:

```css
.notes textarea { width: 100%; box-sizing: border-box; font: inherit; }
.note-composer { display: grid; gap: 0.4rem; margin-bottom: var(--gap); }
.note { margin-top: 0.5rem; }
.note-text { white-space: pre-wrap; }
.note blockquote { margin: 0.4rem 0; padding-left: 0.6rem; border-left: 3px solid #8886; white-space: pre-wrap; }
```

- [ ] **Step 5: Wire notes into the page; fix the form wording**

In `web/src/records/RestaurantDetailPage.tsx`:
- Import `watchNotes` from `"./notes"` and `NotesSection` from `"./NotesSection"`, and add `Note` to the types import.
- After `stateWatch` add `const notesWatch = useWatch<Note[]>((cb) => watchNotes(householdId, rid!, cb), [householdId, rid]);`
- Change the offline line to `const offline = anyOffline(rs, cs, ss, notesWatch.state);`
- Directly before `<section className="notice" data-testid="call-ahead">`, insert:

```tsx
      <NotesSection householdId={householdId} rid={restaurant.id} author={{ uid, displayName }} state={notesWatch.state} disabled={offline} onRetry={notesWatch.retry} />
```

In `web/src/records/RestaurantFormPage.tsx`:
- Add `const [outcomeVerb, setOutcomeVerb] = useState<"save" | "delete">("save");`.
- In `onSubmit`, next to `setOutcome(null);`, add `setOutcomeVerb("save");`. In `onDelete`, before `setOutcome(result.kind);`, add `setOutcomeVerb("delete");`.
- Change `{outcomeMessage(outcome, "This restaurant")}` to `{outcomeMessage(outcome, "This restaurant", outcomeVerb)}`.
- Replace `<span>Delete this restaurant and all of its evidence?</span>` with `<span data-testid="delete-question">Deletes the restaurant, its evidence, and both members' notes.</span>`.

- [ ] **Step 6: Run the gates**

Run: `npm run typecheck && npm run test:unit` → PASS (previous + 9 NotesSection + 2 detail + 1 form).
Run: `npm run emu:e2e` → 29 PASS. The records scenarios use `delete-confirm`, which is unchanged.

- [ ] **Step 7: Commit**

```bash
git add web/src/records/NotesSection.tsx web/src/records/NotesSection.test.tsx web/src/records/RestaurantDetailPage.tsx web/src/records/RestaurantDetailPage.test.tsx web/src/records/RestaurantFormPage.tsx web/src/records/RestaurantFormPage.test.tsx web/src/styles.css
git commit -m "feat(records): authored notes on the restaurant page

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 7: Account change resets every tab

**Files:**
- Create: `web/src/auth/resetDocument.ts`
- Modify: `web/src/auth/AuthProvider.tsx`, `web/src/auth/AuthProvider.test.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: Firebase `onAuthStateChanged` (cross-tab synchronised by the default browser persistence).
- Produces:
  - `resetDocument(): void` → `window.location.replace("/")`
  - `AuthState` gains `{ status: "resetting" }`. `Gate` renders `<main className="screen" data-testid="resetting"><p>Signing out…</p></main>` for it.
  - `signOut()` only calls Firebase sign-out. The listener performs the reset in every document, the initiating one included.

Contract (spec §3.7 "Account switch", audit F2):
- `lastUid` is the last signed-in UID observed *in this document*.
- When the listener reports `null` or a different UID while `lastUid` is set:
  - bump the generation counter, so pending membership lookups are void;
  - set `resetting`, which hides the member UI immediately;
  - call `resetDocument()`.
- No reset when the document starts signed out, or when a callback repeats the same UID.

- [ ] **Step 1: Write the failing tests**

In `web/src/auth/AuthProvider.test.tsx`:

(a) Add a hoisted `resetDocument` mock and module mock:

```ts
const { resetDocument } = vi.hoisted(() => ({ resetDocument: vi.fn() }));
vi.mock("./resetDocument", () => ({ resetDocument }));
```

and add `resetDocument.mockReset();` to `beforeEach`.

(b) Two existing tests now describe resets. Replace `"ignores a slow membership lookup that finishes after the user signed out"` with:

```ts
  it("a sign-out after a sign-in resets the document and a slow lookup never lands", async () => {
    const slowUserDoc = deferred<ReturnType<typeof snap>>();
    getDocMock.mockImplementation((path: string) => {
      if (path === "users/ava-uid") return slowUserDoc.promise;
      if (path === "households/home") return Promise.resolve(snap({ name: "Home", memberIds: ["ava-uid"] }));
      return Promise.resolve(snap(undefined));
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "ava-uid", email: "ava@safebite.test" });
    listeners[0](null);
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"resetting"'));
    expect(resetDocument).toHaveBeenCalledTimes(1);
    slowUserDoc.resolve(snap({ householdId: "home", displayName: "Ava" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("state")).toHaveTextContent('"resetting"');
  });
```

and replace `"never lets an earlier user's lookup overwrite a later user's state"` with:

```ts
  it("a different user in the same document resets it; the earlier lookup never lands", async () => {
    const slowUserDoc = deferred<ReturnType<typeof snap>>();
    getDocMock.mockImplementation((path: string) => {
      if (path === "users/slow-uid") return slowUserDoc.promise;
      return Promise.resolve(snap(undefined));
    });
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "slow-uid", email: "slow@safebite.test" });
    listeners[0]({ uid: "fast-uid", email: "fast@safebite.test" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"resetting"'));
    expect(resetDocument).toHaveBeenCalledTimes(1);
    slowUserDoc.resolve(snap({ householdId: "home", displayName: "Slow" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByTestId("state")).toHaveTextContent('"resetting"');
  });
```

(c) Append:

```ts
  it("never resets a document that starts signed out, then signs in", async () => {
    getDocMock.mockResolvedValue(snap(undefined));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0](null);
    listeners[0]({ uid: "ava-uid", email: "ava@safebite.test" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"notMember"'));
    expect(resetDocument).not.toHaveBeenCalled();
  });

  it("never resets on a repeated callback for the same user", async () => {
    getDocMock.mockResolvedValue(snap(undefined));
    render(<AuthProvider><Probe /></AuthProvider>);
    listeners[0]({ uid: "ava-uid", email: "ava@safebite.test" });
    listeners[0]({ uid: "ava-uid", email: "ava@safebite.test" });
    await waitFor(() => expect(screen.getByTestId("state")).toHaveTextContent('"notMember"'));
    expect(resetDocument).not.toHaveBeenCalled();
  });

  it("signOut only signs out; the reset comes from the listener", async () => {
    const { signOut: firebaseSignOut } = await import("firebase/auth");
    function SignOutButton() {
      const { signOut } = useAuth();
      return <button type="button" onClick={() => void signOut()}>out</button>;
    }
    render(<AuthProvider><SignOutButton /></AuthProvider>);
    screen.getByText("out").click();
    await waitFor(() => expect(firebaseSignOut).toHaveBeenCalledTimes(1));
    expect(resetDocument).not.toHaveBeenCalled();
  });
```

- [ ] **Step 2: Run to verify they fail**

Run: `npm --prefix web test -- AuthProvider`
Expected: FAIL (no `resetting`, no `resetDocument`).

- [ ] **Step 3: Implement**

Create `web/src/auth/resetDocument.ts`:

```ts
/**
 * Full reload to the app root (spec §3.7 "Account switch"). Discards every Firestore listener,
 * the Firestore memory cache and all React state in this tab. A module of its own so tests can
 * replace it (jsdom does not implement navigation).
 */
export function resetDocument(): void {
  window.location.replace("/");
}
```

In `web/src/auth/AuthProvider.tsx`:
- Add `| { status: "resetting" }` to `AuthState` (after `loading`).
- Import `resetDocument` from `"./resetDocument"`.
- In `AuthProvider`, add `const lastUidRef = useRef<string | null>(null);` next to `generationRef`.
- Replace the body of the `onAuthStateChanged` callback with:

```ts
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      const previous = lastUidRef.current;
      // Auth state is shared by every same-origin tab (audit F2): whichever tab signed out or
      // switched user, each document that had a user resets itself. Starting signed out, or a
      // repeat of the same UID, is not a change.
      if (previous !== null && (user === null || user.uid !== previous)) {
        generationRef.current += 1;
        setState({ status: "resetting" });
        resetDocument();
        return;
      }
      if (!user) {
        generationRef.current += 1;
        setState({ status: "signedOut" });
        return;
      }
      lastUidRef.current = user.uid;
      resolveForUser(user);
    });
```

`signOut` stays `await firebaseSignOut(auth);`. Leave its body unchanged and add the comment `// The listener resets this document (and every other tab) when the user becomes null.`

In `web/src/App.tsx`, add to `Gate`'s switch:

```tsx
    case "resetting":
      return <main className="screen" data-testid="resetting"><p>Signing out…</p></main>;
```

- [ ] **Step 4: Run the gates**

Run: `npm run typecheck && npm run test:unit` → PASS (previous + 3 new; two tests rewritten).
Run: `npm run emu:e2e` → 29 PASS. Sign-out now reloads the page. `signOutAndWait` waits for `signin-form`, which the reloaded document renders.

- [ ] **Step 5: Commit**

```bash
git add web/src/auth/resetDocument.ts web/src/auth/AuthProvider.tsx web/src/auth/AuthProvider.test.tsx web/src/App.tsx
git commit -m "feat(auth): reset every tab when its user signs out or changes

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Change password in Settings

**Files:**
- Create: `web/src/auth/changePassword.ts`, `web/src/auth/changePassword.test.ts`
- Create: `web/src/pages/ChangePasswordForm.tsx`, `web/src/pages/ChangePasswordForm.test.tsx`
- Modify: `web/src/pages/SettingsPage.tsx`, `web/src/pages/SettingsPage.test.tsx`

**Interfaces:**
- Consumes: `auth` (`../firebase`); `EmailAuthProvider`, `reauthenticateWithCredential`, `updatePassword` (`firebase/auth`).
- Produces:
  - `type ChangePasswordResult = "ok" | "wrongCurrent" | "tooManyRequests" | "offline" | "policy" | "recentLogin" | "failed"`
  - `MIN_PASSWORD_LENGTH = 8`
  - `validateNewPassword(next: string, confirm: string): string | null`
  - `changePassword(current: string, next: string): Promise<ChangePasswordResult>`
  - `CHANGE_PASSWORD_MESSAGES: Record<Exclude<ChangePasswordResult, "ok">, string>`
  - testids: `pw-form`, `pw-current`, `pw-new`, `pw-confirm`, `pw-submit`, `pw-error`, `pw-outcome` (`data-kind`), `pw-success`

The message table is spec §3.7 (amended after audit F3), verbatim. `updatePassword` is never called after a failed reauthentication. "Password changed" appears only after `updatePassword` resolves.

- [ ] **Step 1: Write the failing module tests**

Create `web/src/auth/changePassword.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  reauthenticateWithCredential: vi.fn(),
  updatePassword: vi.fn(),
  credential: vi.fn((email: string, password: string) => ({ email, password })),
  currentUser: { email: "ava@safebite.test" } as { email: string | null } | null,
}));
vi.mock("../firebase", () => ({
  get auth() {
    return { currentUser: f.currentUser };
  },
}));
vi.mock("firebase/auth", () => ({
  EmailAuthProvider: { credential: f.credential },
  reauthenticateWithCredential: f.reauthenticateWithCredential,
  updatePassword: f.updatePassword,
}));

import { CHANGE_PASSWORD_MESSAGES, changePassword, validateNewPassword } from "./changePassword";

const err = (code: string) => Object.assign(new Error(code), { code });

beforeEach(() => {
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
  f.currentUser = { email: "ava@safebite.test" };
  f.reauthenticateWithCredential.mockResolvedValue({});
  f.updatePassword.mockResolvedValue(undefined);
});
afterEach(() => vi.clearAllMocks());

describe("validateNewPassword", () => {
  it("needs at least 8 characters and a matching confirmation", () => {
    expect(validateNewPassword("short", "short")).toBe("Use at least 8 characters.");
    expect(validateNewPassword("long-enough", "long-enougH")).toBe("The two new passwords don't match.");
    expect(validateNewPassword("long-enough", "long-enough")).toBeNull();
  });
});

describe("changePassword", () => {
  it("reauthenticates with the current password, then updates", async () => {
    expect(await changePassword("old-password", "new-password")).toBe("ok");
    expect(f.credential).toHaveBeenCalledWith("ava@safebite.test", "old-password");
    expect(f.updatePassword).toHaveBeenCalledWith({ email: "ava@safebite.test" }, "new-password");
  });

  it.each([
    ["auth/invalid-credential", "wrongCurrent"],
    ["auth/wrong-password", "wrongCurrent"],
    ["auth/too-many-requests", "tooManyRequests"],
    ["auth/network-request-failed", "offline"],
    ["auth/internal-error", "failed"],
  ])("a failed reauthentication (%s) is %s and never attempts the update", async (code, result) => {
    f.reauthenticateWithCredential.mockRejectedValue(err(code));
    expect(await changePassword("old-password", "new-password")).toBe(result);
    expect(f.updatePassword).not.toHaveBeenCalled();
  });

  it.each([
    ["auth/weak-password", "policy"],
    ["auth/password-does-not-meet-requirements", "policy"],
    ["auth/requires-recent-login", "recentLogin"],
    ["auth/too-many-requests", "tooManyRequests"],
    ["auth/network-request-failed", "offline"],
    ["something/unexpected", "failed"],
  ])("a rejected update (%s) is %s", async (code, result) => {
    f.updatePassword.mockRejectedValue(err(code));
    expect(await changePassword("old-password", "new-password")).toBe(result);
  });

  it("is offline without calling Firebase when the browser is offline, and failed without a signed-in email", async () => {
    Object.defineProperty(navigator, "onLine", { configurable: true, value: false });
    expect(await changePassword("a", "b")).toBe("offline");
    Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
    f.currentUser = null;
    expect(await changePassword("a", "b")).toBe("failed");
    expect(f.reauthenticateWithCredential).not.toHaveBeenCalled();
  });

  it("has a message for every failure", () => {
    expect(CHANGE_PASSWORD_MESSAGES).toEqual({
      wrongCurrent: "That isn't your current password.",
      tooManyRequests: "Too many attempts. Wait a few minutes and try again.",
      offline: "You are offline. Connect and try again.",
      policy: "Your new password doesn't meet this account's password rules. Choose a different one.",
      recentLogin: "For security, sign out and back in, then try again.",
      failed: "Couldn't change your password. Your old password still works.",
    });
  });
});
```

- [ ] **Step 2: Write the failing form tests**

Create `web/src/pages/ChangePasswordForm.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { changePassword } = vi.hoisted(() => ({ changePassword: vi.fn() }));
vi.mock("../auth/changePassword", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../auth/changePassword")>()),
  changePassword,
}));
vi.mock("../firebase", () => ({ auth: {} }));

import { ChangePasswordForm } from "./ChangePasswordForm";

afterEach(() => vi.clearAllMocks());

async function fill(current: string, next: string, confirm = next) {
  await userEvent.type(screen.getByTestId("pw-current"), current);
  await userEvent.type(screen.getByTestId("pw-new"), next);
  await userEvent.type(screen.getByTestId("pw-confirm"), confirm);
  await userEvent.click(screen.getByTestId("pw-submit"));
}

describe("ChangePasswordForm", () => {
  it("validates on the client before calling Firebase", async () => {
    render(<ChangePasswordForm />);
    await fill("old-password", "short");
    expect(screen.getByTestId("pw-error")).toHaveTextContent("Use at least 8 characters.");
    expect(changePassword).not.toHaveBeenCalled();
  });

  it("shows success only after the change resolves, and clears the fields", async () => {
    let resolve!: (v: string) => void;
    changePassword.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<ChangePasswordForm />);
    await fill("old-password", "new-password");
    expect(screen.queryByTestId("pw-success")).toBeNull();
    expect(screen.getByTestId("pw-submit")).toBeDisabled();
    resolve("ok");
    await waitFor(() => expect(screen.getByTestId("pw-success")).toHaveTextContent("Password changed"));
    expect(screen.getByTestId("pw-current")).toHaveValue("");
    expect(screen.getByTestId("pw-new")).toHaveValue("");
  });

  it("a wrong current password clears only that field and keeps the form usable", async () => {
    changePassword.mockResolvedValue("wrongCurrent");
    render(<ChangePasswordForm />);
    await fill("bad-password", "new-password");
    await waitFor(() => expect(screen.getByTestId("pw-outcome")).toHaveAttribute("data-kind", "wrongCurrent"));
    expect(screen.getByTestId("pw-outcome")).toHaveTextContent("That isn't your current password.");
    expect(screen.getByTestId("pw-current")).toHaveValue("");
    expect(screen.getByTestId("pw-new")).toHaveValue("new-password");
    expect(screen.getByTestId("pw-submit")).toBeEnabled();
    expect(screen.queryByTestId("pw-success")).toBeNull();
  });

  it("a policy rejection clears the new-password fields; unknown errors keep every field", async () => {
    changePassword.mockResolvedValueOnce("policy").mockResolvedValueOnce("failed");
    render(<ChangePasswordForm />);
    await fill("old-password", "new-password");
    await waitFor(() => expect(screen.getByTestId("pw-outcome")).toHaveAttribute("data-kind", "policy"));
    expect(screen.getByTestId("pw-current")).toHaveValue("old-password");
    expect(screen.getByTestId("pw-new")).toHaveValue("");
    expect(screen.getByTestId("pw-confirm")).toHaveValue("");
    await userEvent.type(screen.getByTestId("pw-new"), "another-password");
    await userEvent.type(screen.getByTestId("pw-confirm"), "another-password");
    await userEvent.click(screen.getByTestId("pw-submit"));
    await waitFor(() => expect(screen.getByTestId("pw-outcome")).toHaveAttribute("data-kind", "failed"));
    expect(screen.getByTestId("pw-outcome")).toHaveTextContent("Couldn't change your password. Your old password still works.");
    expect(screen.getByTestId("pw-new")).toHaveValue("another-password");
  });
});
```

In `web/src/pages/SettingsPage.test.tsx`, add `vi.mock("./ChangePasswordForm", () => ({ ChangePasswordForm: () => <div data-testid="pw-form" /> }));` and append:

```ts
  it("offers the change-password form", () => {
    render(<SettingsPage />);
    expect(screen.getByTestId("pw-form")).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run to verify they fail**

Run: `npm --prefix web test -- changePassword ChangePasswordForm SettingsPage`
Expected: FAIL.

- [ ] **Step 4: Implement**

Create `web/src/auth/changePassword.ts`:

```ts
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from "firebase/auth";
import { auth } from "../firebase";

/**
 * Change password (spec §3.7, amended after audit F3). The 8-character minimum is a client rule;
 * a server password policy may be stricter, so its rejection has its own outcome.
 */
export type ChangePasswordResult = "ok" | "wrongCurrent" | "tooManyRequests" | "offline" | "policy" | "recentLogin" | "failed";

export const MIN_PASSWORD_LENGTH = 8;

export const CHANGE_PASSWORD_MESSAGES: Record<Exclude<ChangePasswordResult, "ok">, string> = {
  wrongCurrent: "That isn't your current password.",
  tooManyRequests: "Too many attempts. Wait a few minutes and try again.",
  offline: "You are offline. Connect and try again.",
  policy: "Your new password doesn't meet this account's password rules. Choose a different one.",
  recentLogin: "For security, sign out and back in, then try again.",
  failed: "Couldn't change your password. Your old password still works.",
};

export function validateNewPassword(next: string, confirm: string): string | null {
  if (next.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (next !== confirm) return "The two new passwords don't match.";
  return null;
}

const code = (err: unknown) => (err as { code?: string }).code;

function reauthFailure(err: unknown): ChangePasswordResult {
  switch (code(err)) {
    case "auth/invalid-credential":
    case "auth/wrong-password": return "wrongCurrent";
    case "auth/too-many-requests": return "tooManyRequests";
    case "auth/network-request-failed": return "offline";
    default: return "failed";
  }
}

function updateFailure(err: unknown): ChangePasswordResult {
  switch (code(err)) {
    case "auth/weak-password":
    case "auth/password-does-not-meet-requirements": return "policy";
    case "auth/requires-recent-login": return "recentLogin";
    case "auth/too-many-requests": return "tooManyRequests";
    case "auth/network-request-failed": return "offline";
    default: return "failed";
  }
}

export async function changePassword(current: string, next: string): Promise<ChangePasswordResult> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "offline";
  const user = auth.currentUser;
  if (!user || !user.email) return "failed";
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
  } catch (err) {
    return reauthFailure(err); // never attempt the update after a failed reauthentication
  }
  try {
    await updatePassword(user, next);
  } catch (err) {
    return updateFailure(err);
  }
  return "ok";
}
```

Create `web/src/pages/ChangePasswordForm.tsx`:

```tsx
import { useState, type SubmitEvent } from "react";
import { CHANGE_PASSWORD_MESSAGES, changePassword, validateNewPassword, type ChangePasswordResult } from "../auth/changePassword";

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Exclude<ChangePasswordResult, "ok"> | null>(null);
  const [success, setSuccess] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSuccess(false);
    setOutcome(null);
    const problem = validateNewPassword(next, confirm);
    setError(problem);
    if (problem) return;
    setBusy(true);
    const result = await changePassword(current, next);
    setBusy(false);
    if (result === "ok") {
      setCurrent("");
      setNext("");
      setConfirm("");
      setSuccess(true);
      return;
    }
    if (result === "wrongCurrent") setCurrent("");
    if (result === "policy") {
      setNext("");
      setConfirm("");
    }
    setOutcome(result);
  }

  return (
    <form className="form" data-testid="pw-form" onSubmit={onSubmit} noValidate>
      <h3>Change password</h3>
      <label>
        Current password
        <input type="password" autoComplete="current-password" data-testid="pw-current" value={current} onChange={(e) => setCurrent(e.target.value)} />
      </label>
      <label>
        New password
        <input type="password" autoComplete="new-password" data-testid="pw-new" value={next} onChange={(e) => setNext(e.target.value)} />
      </label>
      <label>
        Confirm new password
        <input type="password" autoComplete="new-password" data-testid="pw-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </label>
      {error && <span className="field-error" data-testid="pw-error">{error}</span>}
      <button type="submit" data-testid="pw-submit" disabled={busy}>{busy ? "Changing…" : "Change password"}</button>
      {outcome && <p role="alert" data-testid="pw-outcome" data-kind={outcome}>{CHANGE_PASSWORD_MESSAGES[outcome]}</p>}
      {success && <p role="status" data-testid="pw-success">Password changed</p>}
    </form>
  );
}
```

In `web/src/pages/SettingsPage.tsx`, import `ChangePasswordForm` from `"./ChangePasswordForm"` and render `<ChangePasswordForm />` directly above the sign-out button.

- [ ] **Step 5: Run the gates**

Run: `npm run typecheck && npm run test:unit` → PASS (previous + 15 changePassword (1 validate + 1 success + 5 + 6 `it.each` rows + 1 offline + 1 messages) + 4 form + 1 settings).

- [ ] **Step 6: Commit**

```bash
git add web/src/auth/changePassword.ts web/src/auth/changePassword.test.ts web/src/pages/ChangePasswordForm.tsx web/src/pages/ChangePasswordForm.test.tsx web/src/pages/SettingsPage.tsx web/src/pages/SettingsPage.test.tsx
git commit -m "feat(settings): change password with policy-aware errors

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---
### Task 9: Browser scenarios — shortlist, visited, notes, deletion, conflict

**Files:**
- Modify: `web/e2e/emulator-rest.ts`
- Create: `web/e2e/collection.spec.ts`

**Interfaces:**
- Consumes: every testid from Tasks 4–6; seeded users `ava-uid`/`bogdan-uid` (`ava@safebite.test`, `bogdan@safebite.test`, password `pilot-password-1`).
- Produces (`web/e2e/emulator-rest.ts`): `seedNote(request, rid, id, over?)`, `seedCollection(request, rid, over?)`, `listNoteIds(request, rid)`, `collectionExists(request, rid)`, `updateNoteViaRest(request, rid, nid, text, version)`, `sweepClaimsViaRest(request, rid)`. `clearRecords` also removes notes and every `households/home/collection` document.

- [ ] **Step 1: Extend the emulator helpers**

In `web/e2e/emulator-rest.ts`, replace `clearRecords` with:

```ts
/** Removes every restaurant (with its claims and notes) and every collection document under households/home. Seeds (users/households) are untouched. */
export async function clearRecords(request: APIRequestContext): Promise<void> {
  for (const r of await listDocs(request, "households/home/restaurants")) {
    const rid = idOf(r);
    for (const sub of ["claims", "notes"]) {
      for (const c of await listDocs(request, `households/home/restaurants/${rid}/${sub}`)) {
        await del(request, `households/home/restaurants/${rid}/${sub}/${idOf(c)}`);
      }
    }
    await del(request, `households/home/restaurants/${rid}`);
  }
  for (const s of await listDocs(request, "households/home/collection")) {
    await del(request, `households/home/collection/${idOf(s)}`);
  }
}
```

Append:

```ts
const MEMBERS: Record<string, string> = { "ava-uid": "Ava", "bogdan-uid": "Bogdan" };

export async function seedNote(request: APIRequestContext, rid: string, id: string, over: { authorUid?: string; text?: string; version?: number } = {}): Promise<void> {
  const authorUid = over.authorUid ?? "ava-uid";
  const res = await request.post(`${BASE}/households/home/restaurants/${rid}/notes?documentId=${id}`, {
    headers: HEADERS,
    data: {
      fields: {
        text: s(over.text ?? `Seeded note ${id}`),
        authorUid: s(authorUid),
        authorName: s(MEMBERS[authorUid] ?? "Unknown"),
        createdAt: ts("2026-09-01T10:00:00Z"),
        updatedAt: ts("2026-09-01T10:00:00Z"),
        version: { integerValue: String(over.version ?? 1) },
      },
    },
  });
  if (!res.ok()) throw new Error(`seedNote ${rid}/${id}: ${res.status()} ${await res.text()}`);
}

export async function seedCollection(request: APIRequestContext, rid: string, over: { shortlisted?: boolean; visitedOn?: string; version?: number } = {}): Promise<void> {
  const fields: Record<string, unknown> = {
    shortlisted: { booleanValue: over.shortlisted ?? true },
    visited: { booleanValue: over.visitedOn !== undefined },
    updatedBy: s("ava-uid"),
    updatedByName: s("Ava"),
    updatedAt: ts("2026-09-01T10:00:00Z"),
    version: { integerValue: String(over.version ?? 1) },
  };
  if (over.visitedOn !== undefined) fields.visitedOn = ts(`${over.visitedOn}T00:00:00Z`);
  const res = await request.post(`${BASE}/households/home/collection?documentId=${rid}`, { headers: HEADERS, data: { fields } });
  if (!res.ok()) throw new Error(`seedCollection ${rid}: ${res.status()} ${await res.text()}`);
}

export async function listNoteIds(request: APIRequestContext, rid: string): Promise<string[]> {
  return (await listDocs(request, `households/home/restaurants/${rid}/notes`)).map(idOf);
}

export async function collectionExists(request: APIRequestContext, rid: string): Promise<boolean> {
  const res = await request.get(`${BASE}/households/home/collection/${rid}`, { headers: HEADERS });
  return res.status() === 200;
}

/** Models the same member editing the note on another device. */
export async function updateNoteViaRest(request: APIRequestContext, rid: string, nid: string, text: string, version: number): Promise<void> {
  const url = `${BASE}/households/home/restaurants/${rid}/notes/${nid}?updateMask.fieldPaths=text&updateMask.fieldPaths=version&updateMask.fieldPaths=updatedAt`;
  const res = await request.patch(url, {
    headers: HEADERS,
    data: { fields: { text: s(text), version: { integerValue: String(version) }, updatedAt: ts(new Date().toISOString()) } },
  });
  if (!res.ok()) throw new Error(`updateNote ${rid}/${nid}: ${res.status()} ${await res.text()}`);
}

/** Models a Plan 3-era client that swept claims and then had its final delete refused by the gate. */
export async function sweepClaimsViaRest(request: APIRequestContext, rid: string): Promise<void> {
  for (const c of await listDocs(request, `households/home/restaurants/${rid}/claims`)) {
    await del(request, `households/home/restaurants/${rid}/claims/${idOf(c)}`);
  }
}
```

- [ ] **Step 2: Write the browser scenarios**

Create `web/e2e/collection.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";
import {
  clearRecords,
  collectionExists,
  listClaimIds,
  listNoteIds,
  markDeletingViaRest,
  restaurantExists,
  seedClaim,
  seedCollection,
  seedNote,
  seedRestaurant,
  sweepClaimsViaRest,
  updateNoteViaRest,
} from "./emulator-rest";

const PASSWORD = "pilot-password-1";

async function signIn(page: Page, email: string) {
  await page.goto("/");
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(PASSWORD);
  await page.getByTestId("signin-submit").click();
  await expect(page.getByTestId("nav-saved")).toBeVisible();
}

test.beforeEach(async ({ request }) => {
  await clearRecords(request);
});

test("C1. a shortlist change by one member appears live on the other member's Saved page", async ({ page, browser, request }) => {
  await seedRestaurant(request, "r-a", { name: "Da Marco" });
  await seedRestaurant(request, "r-b", { name: "Zest" });

  const bogdanContext = await browser.newContext();
  const bogdan = await bogdanContext.newPage();
  await signIn(bogdan, "bogdan@safebite.test");
  await bogdan.getByTestId("nav-saved").click();
  await expect(bogdan.getByTestId("shortlist-empty")).toBeVisible();

  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-a");
  await page.getByTestId("shortlist-add").click();
  await expect(page.getByTestId("shortlist-state")).toHaveText("On shortlist");
  await expect(page.getByTestId("status-changed-by")).toHaveText("Last changed by Ava");

  await expect(bogdan.getByTestId("restaurant-row")).toHaveCount(1);
  await expect(bogdan.getByTestId("restaurant-row")).toContainText("Da Marco");
  await expect(bogdan.getByTestId("label-shortlisted")).toBeVisible();
  await bogdan.getByTestId("filter-all").click();
  await expect(bogdan.getByTestId("restaurant-row")).toHaveCount(2);
  await bogdanContext.close();
  expect(await collectionExists(request, "r-a")).toBe(true);
});

test("C2. mark visited, change the date, and clear it", async ({ page, request }) => {
  await seedRestaurant(request, "r-v", { name: "Visited Place" });
  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-v");
  await page.getByTestId("visited-mark").click();
  await page.getByTestId("visited-date").fill("2026-05-03");
  await page.getByTestId("visited-save").click();
  await expect(page.getByTestId("visited-state")).toHaveText("Visited 3 May 2026");

  await page.getByTestId("visited-change").click();
  await page.getByTestId("visited-date").fill("2026-05-10");
  await page.getByTestId("visited-save").click();
  await expect(page.getByTestId("visited-state")).toHaveText("Visited 10 May 2026");

  await page.getByTestId("nav-saved").click();
  await page.getByTestId("filter-all").click();
  await expect(page.getByTestId("label-visited")).toHaveText("Visited 10 May 2026");

  await page.goto("/restaurants/r-v");
  await page.getByTestId("visited-clear").click();
  await expect(page.getByTestId("visited-mark")).toBeVisible();
});

test("C3. both members write notes; only the author can edit or delete", async ({ page, browser, request }) => {
  await seedRestaurant(request, "r-n", { name: "Notes Place" });
  await seedNote(request, "r-n", "n-ava", { authorUid: "ava-uid", text: "Ava: staff checked with the chef" });

  const bogdanContext = await browser.newContext();
  const bogdan = await bogdanContext.newPage();
  await signIn(bogdan, "bogdan@safebite.test");
  await bogdan.goto("/restaurants/r-n");
  await expect(bogdan.getByTestId("note-n-ava")).toContainText("Ava: staff checked with the chef");
  await expect(bogdan.getByTestId("note-edit-n-ava")).toHaveCount(0);
  await expect(bogdan.getByTestId("note-delete-n-ava")).toHaveCount(0);
  await bogdan.getByTestId("note-add-text").fill("Bogdan: fryer is shared, avoid chips");
  await bogdan.getByTestId("note-add-save").click();
  const bogdanEdit = bogdan.locator('[data-testid^="note-edit-"]');
  await expect(bogdanEdit).toHaveCount(1);
  await bogdanEdit.click();
  await bogdan.locator('[data-testid^="note-edit-text-"]').fill("Bogdan: fryer is shared, no chips");
  await bogdan.locator('[data-testid^="note-save-"]').click();

  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-n");
  await expect(page.getByTestId("notes-section")).toContainText("Bogdan: fryer is shared, no chips");
  await expect(page.getByTestId("notes-section")).toContainText("edited");
  await expect(page.locator('[data-testid^="note-edit-"]')).toHaveCount(1); // only her own
  await page.getByTestId("note-delete-n-ava").click();
  await page.getByTestId("note-delete-confirm-n-ava").click();
  await expect(page.getByTestId("note-n-ava")).toHaveCount(0);
  await expect(bogdan.getByTestId("note-n-ava")).toHaveCount(0);
  await bogdanContext.close();
  expect(await listNoteIds(request, "r-n")).toHaveLength(1);
});

test("C4. deleting a restaurant removes its evidence, both members' notes and its shortlist state", async ({ page, request }) => {
  await seedRestaurant(request, "r-del", { name: "Doomed" });
  await seedClaim(request, "r-del", "c1");
  await seedNote(request, "r-del", "n1", { authorUid: "ava-uid" });
  await seedNote(request, "r-del", "n2", { authorUid: "bogdan-uid" });
  await seedCollection(request, "r-del", { shortlisted: true, visitedOn: "2026-05-03" });

  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-del/edit");
  await expect(page.getByTestId("field-name")).toHaveValue("Doomed");
  await page.getByTestId("delete-restaurant").click();
  await expect(page.getByTestId("delete-question")).toHaveText("Deletes the restaurant, its evidence, and both members' notes.");
  await page.getByTestId("delete-confirm").click();
  await expect(page.getByTestId("restaurants-empty")).toBeVisible({ timeout: 15_000 });

  expect(await restaurantExists(request, "r-del")).toBe(false);
  expect(await listClaimIds(request, "r-del")).toEqual([]);
  expect(await listNoteIds(request, "r-del")).toEqual([]);
  expect(await collectionExists(request, "r-del")).toBe(false);
});

test("C5. a deletion an older client left half-done is finished from the Saved page", async ({ page, request }) => {
  await seedRestaurant(request, "r-old", { name: "Half Gone" });
  await seedClaim(request, "r-old", "c1");
  await seedNote(request, "r-old", "n1", { authorUid: "bogdan-uid" });
  await seedCollection(request, "r-old");
  await markDeletingViaRest(request, "r-old");
  await sweepClaimsViaRest(request, "r-old"); // the old client got this far; the gate refused its final delete

  await signIn(page, "ava@safebite.test");
  await page.getByTestId("nav-saved").click();
  await expect(page.getByTestId("restaurants-empty")).toBeVisible({ timeout: 15_000 });
  expect(await restaurantExists(request, "r-old")).toBe(false);
  expect(await listNoteIds(request, "r-old")).toEqual([]);
  expect(await collectionExists(request, "r-old")).toBe(false);
});

test("C6. a note edited on another device surfaces as a conflict, and Keep mine wins with the new version", async ({ page, request }) => {
  await seedRestaurant(request, "r-c", { name: "Conflict Cafe" });
  await seedNote(request, "r-c", "n-ava", { authorUid: "ava-uid", text: "First thoughts" });

  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-c");
  await page.getByTestId("note-edit-n-ava").click();
  await page.getByTestId("note-edit-text-n-ava").fill("My draft from the laptop");
  await updateNoteViaRest(request, "r-c", "n-ava", "Written on the phone", 2);
  await expect(page.getByTestId("note-n-ava")).toHaveAttribute("data-version", "2");
  await page.getByTestId("note-save-n-ava").click();
  await expect(page.getByTestId("note-conflict-current-n-ava")).toHaveText("Written on the phone");
  await expect(page.getByTestId("note-edit-text-n-ava")).toHaveValue("My draft from the laptop");
  await page.getByTestId("note-keep-mine-n-ava").click();
  await expect(page.getByTestId("note-n-ava")).toContainText("My draft from the laptop");
  await expect(page.getByTestId("note-n-ava")).toHaveAttribute("data-version", "3");
});

test("C7. while offline the page says so once and every write control is disabled", async ({ page, context, request }) => {
  await seedRestaurant(request, "r-off", { name: "Offline Place" });
  await signIn(page, "ava@safebite.test");
  await page.goto("/restaurants/r-off");
  await expect(page.getByTestId("shortlist-add")).toBeEnabled();
  await context.setOffline(true);
  await expect(page.getByTestId("read-offline")).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByTestId("shortlist-add")).toBeDisabled();
  await expect(page.getByTestId("note-add-save")).toBeDisabled();
  await context.setOffline(false);
  await expect(page.getByTestId("shortlist-add")).toBeEnabled({ timeout: 15_000 });
  expect(await collectionExists(request, "r-off")).toBe(false);
});
```

- [ ] **Step 3: Run the browser suite**

Run: `npm run emu:e2e` (10 min timeout)
Expected: PASS, 29 + 7 = 36. If C7 does not see the offline state within 15 s, the Firestore SDK has not yet reported `fromCache`. That is a real finding. Report it; do not raise timeouts beyond 15 s.

Run: `npm run emu:e2e:stress` → PASS with `--repeat-each=3 --retries=0`. Report the count.

- [ ] **Step 4: Commit**

```bash
git add web/e2e/emulator-rest.ts web/e2e/collection.spec.ts
git commit -m "test(e2e): shortlist, visited, notes, deletion gate and note conflicts

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Browser scenarios — cross-tab reset and change password; budget, README

**Files:**
- Create: `web/e2e/auth-rest.ts`
- Modify: `web/e2e/auth.spec.ts`
- Modify: `web/playwright.config.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 7 (`resetting`, per-tab reset), Task 8 testids, Task 9 `seedRestaurant`/`seedNote`.
- Produces: `setPasswordViaAdmin(request, uid, password)` against the Auth emulator (`Bearer owner`).

- [ ] **Step 1: Add the Auth-emulator helper**

Create `web/e2e/auth-rest.ts`:

```ts
import type { APIRequestContext } from "@playwright/test";

/**
 * Admin password reset in the Auth emulator (127.0.0.1:9099, project demo-safebite), used to
 * restore the shared fixture password after a test changes it. Never talks to a real project.
 */
export async function setPasswordViaAdmin(request: APIRequestContext, uid: string, password: string): Promise<void> {
  const res = await request.post("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-safebite/accounts:update", {
    headers: { Authorization: "Bearer owner", "Content-Type": "application/json" },
    data: { localId: uid, password },
  });
  if (!res.ok()) throw new Error(`setPassword ${uid}: ${res.status()} ${await res.text()}`);
}
```

- [ ] **Step 2: Write the scenarios**

In `web/e2e/auth.spec.ts`, add imports:

```ts
import { setPasswordViaAdmin } from "./auth-rest";
import { clearRecords, seedNote, seedRestaurant } from "./emulator-rest";
```

and a helper that signs in *without* navigating (the cross-tab test must not reload):

```ts
/** Fills the sign-in form already on screen. No navigation: a reload would hide a broken reset. */
async function fillSignIn(page: Page, email: string, password = PASSWORD) {
  await expect(page.getByTestId("signin-form")).toBeVisible();
  await page.getByTestId("signin-email").fill(email);
  await page.getByTestId("signin-password").fill(password);
  await page.getByTestId("signin-submit").click();
}
```

Append:

```ts
test("signing out in one tab resets every tab, and the next account never sees the previous household", async ({ page, request }) => {
  await clearRecords(request);
  await seedRestaurant(request, "r-tabs", { name: "Tab Test Bistro" });
  await seedNote(request, "r-tabs", "n1", { text: "Tab test note" });

  await signIn(page, "ava@safebite.test");
  await expect(page.getByTestId("nav-discover")).toBeVisible();
  const second = await page.context().newPage(); // same browser context: shared auth persistence
  await page.goto("/restaurants/r-tabs");
  await second.goto("/restaurants/r-tabs");
  for (const p of [page, second]) {
    await expect(p.getByTestId("restaurant-name")).toHaveText("Tab Test Bistro");
    await expect(p.getByTestId("notes-section")).toContainText("Tab test note");
    await p.evaluate(() => {
      (window as unknown as { __beforeSignOut?: boolean }).__beforeSignOut = true;
    });
  }
  // Every later document in the second tab records whether it ever renders the old household.
  await second.addInitScript(() => {
    const w = window as unknown as { __sawOldData?: boolean };
    w.__sawOldData = false;
    new MutationObserver(() => {
      const text = document.body?.innerText ?? "";
      if (text.includes("Tab Test Bistro") || text.includes("Tab test note")) w.__sawOldData = true;
    }).observe(document, { childList: true, subtree: true, characterData: true });
  });

  await page.getByTestId("nav-settings").click();
  await page.getByTestId("signout").click();

  for (const p of [page, second]) {
    await expect(p.getByTestId("signin-form")).toBeVisible();
    // A new document: the marker set before sign-out is gone, so the tab really reloaded.
    await expect.poll(() => p.evaluate(() => (window as unknown as { __beforeSignOut?: boolean }).__beforeSignOut ?? false)).toBe(false);
  }

  await fillSignIn(second, "stranger@safebite.test");
  await expect(second.getByTestId("not-invited")).toBeVisible();
  await expect(second.getByText("Tab Test Bistro")).toHaveCount(0);
  expect(await second.evaluate(() => (window as unknown as { __sawOldData?: boolean }).__sawOldData)).toBe(false);
  await second.close();
});

test("a member changes their password, stays signed in, and only the new password works afterwards", async ({ page, request }) => {
  try {
    await signIn(page, "bogdan@safebite.test");
    await expect(page.getByTestId("nav-discover")).toBeVisible();
    await page.getByTestId("nav-settings").click();

    await page.getByTestId("pw-current").fill("not-my-password");
    await page.getByTestId("pw-new").fill("changed-password-1");
    await page.getByTestId("pw-confirm").fill("changed-password-1");
    await page.getByTestId("pw-submit").click();
    await expect(page.getByTestId("pw-outcome")).toHaveAttribute("data-kind", "wrongCurrent");

    await page.getByTestId("pw-current").fill(PASSWORD);
    await page.getByTestId("pw-submit").click();
    await expect(page.getByTestId("pw-success")).toHaveText("Password changed");
    await expect(page.getByTestId("nav-settings")).toBeVisible(); // same UID: no reset

    await signOutAndWait(page);
    await fillSignIn(page, "bogdan@safebite.test", PASSWORD);
    await expect(page.getByTestId("signin-error")).toBeVisible();
    await fillSignIn(page, "bogdan@safebite.test", "changed-password-1");
    await expect(page.getByTestId("nav-discover")).toBeVisible();
  } finally {
    await setPasswordViaAdmin(request, "bogdan-uid", PASSWORD);
  }
});
```

- [ ] **Step 3: Raise the suite budget and document**

In `web/playwright.config.ts`, change `globalTimeout: 900_000` to `globalTimeout: 1_200_000` and update its comment to "38 scenarios".

In `README.md`, section "Web app (PWA) — private pilot":
- Under local development, add one paragraph. It says Saved shows the household shortlist by default ("All records" shows everything). Each restaurant has shortlist/visited controls and "Our notes"; notes are personal and never evidence. Deleting a restaurant also deletes both members' notes and its shortlist state. Settings has "Change password".
- Replace "`npm run test:unit` currently reports 270 tests." with the count printed by the final `npm run test:unit` run in this task. Add the functions + rules and browser counts printed by the final `npm run emu:test` / `npm run emu:e2e`, in the same sentence style.

- [ ] **Step 4: Full gate**

Run each and record the counts:
- `npm run typecheck`
- `npm run test:unit`
- `npm run emu:test`
- `npm run emu:e2e` (retries 0 locally) → 38
- `npm run emu:e2e:stress` → report passed/total
- `npm --prefix web run build:e2e && npm --prefix web run e2e:boot-guard && npm --prefix web run e2e:preview && npm --prefix web run e2e:upgrade` → 1 / 4 / 7
- Guardrail greps (each must print nothing):
  - `git grep -n "safebite-production-13ba1" -- ':!SafeBite/**' ':!*.md' ':!docs/**' ':!.github/workflows/ci.yml' ':!web/src/config/firebaseEnv.ts' ':!web/src/config/firebaseEnv.test.ts'`
  - `git grep -nE "setDoc|updateDoc|deleteDoc|writeBatch" -- web/src ':!*.test.ts' ':!*.test.tsx'`
  - `git grep -nE "window\.(confirm|alert|prompt)" -- web/src`
  - `git grep -nE "localStorage|sessionStorage|indexedDB" -- web/src/records web/src/auth web/src/pages ':!*.test.ts' ':!*.test.tsx'` (the service worker's existing one-shot reload flag in `web/src/pwa` is out of scope)
  - `git diff --check f8edfc9`

- [ ] **Step 5: Commit**

```bash
git add web/e2e/auth-rest.ts web/e2e/auth.spec.ts web/playwright.config.ts README.md
git commit -m "test(e2e): cross-tab reset and change password; README and suite budget

Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>"
```

---

## Plan self-review (2026-09-24)

**Spec coverage (§3.7 as amended):**

| Requirement | Task |
|---|---|
| Rulings 1–3: shortlist within records, notes on the record, household-wide visited | 1, 3, 4, 5, 6 |
| Ruling 4: separate `collection/{rid}` | 1, 3 |
| Ruling 5: change password | 8, 10 |
| Collection data model and rules; `updatedByName` | 1 |
| Notes data model and rules; delete during deletion | 1 |
| Completion gate and read-before-delete sweeps (F1) | 2 |
| Mixed-version, concurrent and retry tests (F1 acceptance) | 2 (rules protocol), 9 C5 (real client resumes) |
| Saved page: filter, labels, order, empty states, joined states, no list toggles | 4 |
| Restaurant page: status block, notes, subtitle, author-only controls, edited marker, draft kept, conflict chooser, confirmation identity | 5, 6 |
| One offline notice; errors shown (parked 2b double notice) | 4, 5, 6 |
| Parked 2b wording (resume flow, form outcome verb) | 4, 6 |
| Deletion confirmation text; "Removing notes…" | 2, 6 |
| Account switch across tabs (F2) + unit no-loop cases | 7, 10 |
| Change password error contract (F3) | 8, 10 |
| Test isolation: cleanup of notes/collection; password restored | 9, 10 |
| Deploy note | spec only (no deploy in this plan) |

**Deliberate deviation for the owner/auditor:** spec §3.7 lists a browser test of a "simultaneous toggle conflict". A live listener refreshes the toggle's base version within milliseconds, so two clicks from two browsers cannot be made to race deterministically in Playwright. The toggle conflict is therefore proven at the repository level (Task 3: stale base → `conflict`, no write) and the component level (Task 5: conflict message, no automatic retry). The browser proves the same version-conflict path with a note edited on another device (Task 9, C6), which is deterministic. The rules side is proven in Task 1 (stale version refused).

**Placeholder scan:** none. Every code step carries code. The README counts are to be read from the final gate run, which is intentional (plan constraint: no asserted absolute totals).

**Type consistency:** `DeleteStep` (Task 2) is used by `deleteProgressText` (Tasks 2, 4). `CollectionState`/`Note` (Task 3) are used in Tasks 4–6. `isData`/`anyOffline`/`combineStates` (Task 4) are used in Tasks 5–6. `setShortlisted(hid, rid, author, baseVersion, bool)` and `setVisited(hid, rid, author, baseVersion, date | null)` match between Tasks 3 and 5. `updateNote(hid, rid, nid, baseVersion, text)` and `deleteNote(hid, rid, nid, baseVersion)` match between Tasks 3 and 6.
