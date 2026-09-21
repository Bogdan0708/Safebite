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

/** A valid create payload as the client writes it (server timestamps, version 1, not deleting). */
function restaurantCreate(uid = "ava", over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: "Da Marco",
    address: "Via Roma 1, Rome",
    createdBy: uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    version: 1,
    deleting: false,
    ...over,
  };
}

/** Seeds an existing restaurant bypassing rules; returns its path. */
async function seedRestaurant(id: string, over: Record<string, unknown> = {}): Promise<string> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), `${R}/${id}`), {
      name: "Seeded",
      address: "Somewhere 1",
      createdBy: "ava",
      createdAt: Timestamp.fromDate(new Date("2026-09-01T10:00:00Z")),
      updatedAt: Timestamp.fromDate(new Date("2026-09-01T10:00:00Z")),
      version: 3,
      deleting: false,
      ...over,
    });
  });
  return `${R}/${id}`;
}

describe("restaurants — reads", () => {
  it("members read a document and list the collection; others do not", async () => {
    await seedRestaurant("r1");
    await assertSucceeds(getDoc(doc(as("ava"), `${R}/r1`)));
    await assertSucceeds(getDoc(doc(as("bogdan"), `${R}/r1`)));
    await assertSucceeds(getDocs(collection(as("ava"), R)));
    await assertFails(getDoc(doc(as("stranger"), `${R}/r1`)));
    await assertFails(getDocs(collection(as("stranger"), R)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `${R}/r1`)));
  });

  it("a member of one household cannot read another household's restaurants", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "households/other/restaurants/x"), restaurantCreate("stranger", { createdAt: new Date(), updatedAt: new Date() }));
    });
    await assertFails(getDoc(doc(as("ava"), "households/other/restaurants/x")));
  });
});

describe("restaurants — create", () => {
  it.each([
    ["minimal", {}],
    ["with phone and website", { phone: "+39 06 123", website: "https://damarco.it" }],
    ["with a coordinate pair", { lat: 41.9, lng: 12.5 }],
    ["with a Google place id", { googlePlaceId: "ChIJexample" }],
    ["at the length limits", { name: "n".repeat(120), address: "a".repeat(300), phone: "1".repeat(40) }],
  ])("accepts a valid create: %s", async (_label, over) => {
    await assertSucceeds(setDoc(doc(as("ava"), `${R}/new`), restaurantCreate("ava", over)));
  });

  it.each([
    ["createdBy is someone else", { createdBy: "bogdan" }],
    ["version is not 1", { version: 2 }],
    ["deleting is true", { deleting: true }],
    ["an unknown key", { rating: 5 }],
    ["website is not http(s)", { website: "ftp://damarco.it" }],
    ["lat without lng", { lat: 41.9 }],
    ["lat out of range", { lat: 91, lng: 0 }],
    ["lng out of range", { lat: 0, lng: -181 }],
    ["lat is a string", { lat: "41.9", lng: 12.5 }],
    ["whitespace-only name", { name: "   " }],
    ["name too long", { name: "n".repeat(121) }],
    ["address too long", { address: "a".repeat(301) }],
    ["phone too long", { phone: "1".repeat(41) }],
    ["empty optional phone", { phone: "" }],
    ["client-supplied createdAt", { createdAt: new Date() }],
    ["client-supplied updatedAt", { updatedAt: new Date() }],
    ["missing deleting flag", { deleting: undefined }],
  ])("rejects a create where %s", async (_label, over) => {
    const data = restaurantCreate("ava", over);
    for (const key of Object.keys(data)) if (data[key] === undefined) delete data[key];
    await assertFails(setDoc(doc(as("ava"), `${R}/bad`), data));
  });

  it("rejects a create by a non-member and by an unauthenticated client", async () => {
    await assertFails(setDoc(doc(as("stranger"), `${R}/bad`), restaurantCreate("stranger")));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), `${R}/bad`), restaurantCreate("ava")));
  });
});

describe("restaurants — update", () => {
  it("accepts the next version with a server updatedAt and unchanged createdBy/createdAt", async () => {
    const p = await seedRestaurant("r1");
    await assertSucceeds(updateDoc(doc(as("bogdan"), p), { name: "Renamed", version: 4, updatedAt: serverTimestamp() }));
  });

  it.each([
    ["the version is stale (same as stored)", { name: "x", version: 3, updatedAt: serverTimestamp() }],
    ["the version skips ahead", { name: "x", version: 5, updatedAt: serverTimestamp() }],
    ["updatedAt is client-supplied", { name: "x", version: 4, updatedAt: new Date() }],
    ["updatedAt is missing", { name: "x", version: 4 }],
    ["createdBy changes", { createdBy: "bogdan", version: 4, updatedAt: serverTimestamp() }],
    ["createdAt changes", { createdAt: new Date(), version: 4, updatedAt: serverTimestamp() }],
    ["an unknown key is added", { score: 90, version: 4, updatedAt: serverTimestamp() }],
    ["the website becomes invalid", { website: "damarco.it", version: 4, updatedAt: serverTimestamp() }],
    ["marking deleting also changes a field", { deleting: true, name: "x", version: 4, updatedAt: serverTimestamp() }],
  ])("rejects an update where %s", async (_label, patch) => {
    const p = await seedRestaurant("r1");
    await assertFails(updateDoc(doc(as("ava"), p), patch));
  });

  it("accepts the deleting mark (only deleting, version and updatedAt change)", async () => {
    const p = await seedRestaurant("r1");
    await assertSucceeds(updateDoc(doc(as("ava"), p), { deleting: true, version: 4, updatedAt: serverTimestamp() }));
  });

  it("rejects every update once deleting is true, including un-marking", async () => {
    const p = await seedRestaurant("r1", { deleting: true });
    await assertFails(updateDoc(doc(as("ava"), p), { name: "x", version: 4, updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(as("ava"), p), { deleting: false, version: 4, updatedAt: serverTimestamp() }));
  });

  it("rejects updates by non-members", async () => {
    const p = await seedRestaurant("r1");
    await assertFails(updateDoc(doc(as("stranger"), p), { name: "x", version: 4, updatedAt: serverTimestamp() }));
  });
});

describe("restaurants — delete", () => {
  it("rejects deleting a restaurant that is not marked deleting", async () => {
    const p = await seedRestaurant("r1");
    await assertFails(deleteDoc(doc(as("ava"), p)));
  });

  it("accepts deleting a marked restaurant by either member, never by a non-member", async () => {
    const p = await seedRestaurant("r1", { deleting: true });
    await assertFails(deleteDoc(doc(as("stranger"), p)));
    await assertSucceeds(deleteDoc(doc(as("bogdan"), p)));
  });
});

const utcDate = (d: string) => Timestamp.fromDate(new Date(`${d}T00:00:00.000Z`));
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const daysAhead = (n: number) => isoDay(new Date(Date.now() + n * 86_400_000));

const KINDS = ["dedicatedKitchen", "separateFryer", "trainedStaff", "gfMenu", "preparationPractice", "accreditation"] as const;
const VALUES = ["yes", "no", "partial"] as const;
const SOURCE_TYPES = ["restaurantStatement", "accreditingBody", "ownVisit", "thirdParty"] as const;

function claimCreate(uid: "ava" | "bogdan" = "ava", over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "separateFryer",
    value: "yes",
    detail: "Dedicated fryer for chips, confirmed by the manager.",
    source: { type: "restaurantStatement", label: "Phone call with the manager" },
    checkedAt: utcDate("2026-09-20"),
    authorUid: uid,
    authorName: uid === "ava" ? "Ava" : "Bogdan",
    createdAt: serverTimestamp(),
    ...over,
  };
}

const C = `${R}/r1/claims`;

describe("claims — reads", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${C}/c1`), claimCreate("ava", { createdAt: new Date() }));
    });
  });

  it("members read and list; non-members and anonymous do not", async () => {
    await assertSucceeds(getDoc(doc(as("ava"), `${C}/c1`)));
    await assertSucceeds(getDocs(collection(as("bogdan"), C)));
    await assertFails(getDoc(doc(as("stranger"), `${C}/c1`)));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), `${C}/c1`)));
  });
});

describe("claims — create, every valid combination", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
  });

  const combos: Array<[string, Record<string, unknown>]> = [];
  for (const kind of KINDS) {
    for (const value of VALUES) {
      for (const type of SOURCE_TYPES) {
        if (kind === "accreditation" && type !== "accreditingBody") continue;
        const source: Record<string, unknown> = { type, label: `${type} source` };
        if (type === "accreditingBody") source.url = "https://accreditor.test/listing/1";
        combos.push([`${kind} / ${value} / ${type}`, { kind, value, source }]);
      }
    }
  }
  it.each(combos)("accepts %s", async (_label, over) => {
    await assertSucceeds(setDoc(doc(as("ava"), `${C}/new`), claimCreate("ava", over)));
  });

  it("accepts an optional expiry after the checked date, an empty detail, and a checked date one day ahead of UTC", async () => {
    await assertSucceeds(setDoc(doc(as("ava"), `${C}/a`), claimCreate("ava", { expiresAt: utcDate("2027-03-01") })));
    await assertSucceeds(setDoc(doc(as("ava"), `${C}/b`), claimCreate("ava", { detail: "" })));
    await assertSucceeds(setDoc(doc(as("bogdan"), `${C}/c`), claimCreate("bogdan", { checkedAt: utcDate(daysAhead(1)) })));
    await assertSucceeds(setDoc(doc(as("ava"), `${C}/d`), claimCreate("ava", { source: { type: "thirdParty", label: "Blog", url: "http://blog.test/post" } })));
  });
});

describe("claims — create, rejected", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
  });

  it.each([
    ["unknown kind", { kind: "score" }],
    ["unknown value", { value: "maybe" }],
    ["unknown source type", { source: { type: "rumour", label: "x" } }],
    ["source missing label", { source: { type: "ownVisit" } }],
    ["source with an extra key", { source: { type: "ownVisit", label: "x", rating: 5 } }],
    ["source label whitespace-only", { source: { type: "ownVisit", label: "   " } }],
    ["source label too long", { source: { type: "ownVisit", label: "l".repeat(201) } }],
    ["source url not http(s)", { source: { type: "thirdParty", label: "x", url: "ftp://x.test" } }],
    ["source url too long", { source: { type: "thirdParty", label: "x", url: "https://x.test/" + "a".repeat(500) } }],
    ["accrediting body without url", { source: { type: "accreditingBody", label: "Coeliac UK" } }],
    ["accreditation from a third party even with a url", { kind: "accreditation", source: { type: "thirdParty", label: "Blog", url: "https://blog.test" } }],
    ["detail too long", { detail: "d".repeat(1001) }],
    ["detail not a string", { detail: 42 }],
    ["checkedAt not at UTC midnight", { checkedAt: Timestamp.fromDate(new Date("2026-09-20T10:00:00.000Z")) }],
    ["checkedAt is 'now' (not midnight)", { checkedAt: new Date() }],
    ["checkedAt two days ahead", { checkedAt: utcDate(daysAhead(2)) }],
    ["checkedAt a string", { checkedAt: "2026-09-20" }],
    ["expiresAt equal to checkedAt", { expiresAt: utcDate("2026-09-20") }],
    ["expiresAt before checkedAt", { expiresAt: utcDate("2026-09-19") }],
    ["expiresAt not at UTC midnight", { expiresAt: Timestamp.fromDate(new Date("2027-01-01T12:00:00.000Z")) }],
    ["authorUid is someone else", { authorUid: "bogdan" }],
    ["authorName is not the caller's display name", { authorName: "Somebody" }],
    ["client-supplied createdAt", { createdAt: new Date() }],
    ["an extra top-level key", { verified: true }],
    ["missing kind", { kind: undefined }],
  ])("rejects a create where %s", async (_label, over) => {
    const data = claimCreate("ava", over);
    for (const key of Object.keys(data)) if (data[key] === undefined) delete data[key];
    await assertFails(setDoc(doc(as("ava"), `${C}/bad`), data));
  });

  it("rejects a create by a non-member or anonymous client", async () => {
    await assertFails(setDoc(doc(as("stranger"), `${C}/bad`), claimCreate("ava", { authorUid: "stranger", authorName: "Stranger" })));
    await assertFails(setDoc(doc(env.unauthenticatedContext().firestore(), `${C}/bad`), claimCreate("ava")));
  });

  it("rejects a create under a missing parent (F1: no orphans)", async () => {
    await assertFails(setDoc(doc(as("ava"), `${R}/ghost/claims/bad`), claimCreate("ava")));
  });

  it("rejects a create under a parent marked deleting (F1: the mark closes the door before the sweep)", async () => {
    await seedRestaurant("r2", { deleting: true });
    await assertFails(setDoc(doc(as("ava"), `${R}/r2/claims/bad`), claimCreate("ava")));
  });
});

describe("claims — immutability and deletion", () => {
  beforeEach(async () => {
    await seedRestaurant("r1");
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `${C}/c1`), claimCreate("ava", { createdAt: new Date() }));
    });
  });

  it("rejects every update, even by the author", async () => {
    await assertFails(updateDoc(doc(as("ava"), `${C}/c1`), { detail: "edited" }));
    await assertFails(updateDoc(doc(as("ava"), `${C}/c1`), { value: "no" }));
  });

  it("either member may delete; a non-member may not", async () => {
    await assertFails(deleteDoc(doc(as("stranger"), `${C}/c1`)));
    await assertSucceeds(deleteDoc(doc(as("bogdan"), `${C}/c1`)));
  });

  it("claims can still be deleted while the parent is marked deleting (the sweep needs this)", async () => {
    await seedRestaurant("r1", { deleting: true });
    await assertSucceeds(deleteDoc(doc(as("ava"), `${C}/c1`)));
  });
});
