import type { APIRequestContext } from "@playwright/test";

/**
 * Direct Firestore-emulator access for test setup and verification, bypassing rules with the
 * emulator's admin token. Only ever talks to 127.0.0.1:8080 (project demo-safebite).
 */
const BASE = "http://127.0.0.1:8080/v1/projects/demo-safebite/databases/(default)/documents";
const HEADERS = { Authorization: "Bearer owner", "Content-Type": "application/json" };

interface RestDoc { name: string; fields?: Record<string, unknown> }

async function listDocs(request: APIRequestContext, collectionPath: string): Promise<RestDoc[]> {
  const res = await request.get(`${BASE}/${collectionPath}?pageSize=300`, { headers: HEADERS });
  if (!res.ok()) throw new Error(`list ${collectionPath}: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as { documents?: RestDoc[] };
  return body.documents ?? [];
}

const idOf = (d: RestDoc) => d.name.slice(d.name.lastIndexOf("/") + 1);

async function del(request: APIRequestContext, docPath: string): Promise<void> {
  const res = await request.delete(`${BASE}/${docPath}`, { headers: HEADERS });
  if (!res.ok()) throw new Error(`delete ${docPath}: ${res.status()} ${await res.text()}`);
}

/** Removes every restaurant (and its claims) under households/home. Seeds (users/households) are untouched. */
export async function clearRecords(request: APIRequestContext): Promise<void> {
  for (const r of await listDocs(request, "households/home/restaurants")) {
    const rid = idOf(r);
    for (const c of await listDocs(request, `households/home/restaurants/${rid}/claims`)) {
      await del(request, `households/home/restaurants/${rid}/claims/${idOf(c)}`);
    }
    await del(request, `households/home/restaurants/${rid}`);
  }
}

const s = (v: string) => ({ stringValue: v });
const ts = (iso: string) => ({ timestampValue: iso });

export async function seedRestaurant(request: APIRequestContext, id: string, over: { name?: string; deleting?: boolean; version?: number } = {}): Promise<void> {
  const res = await request.post(`${BASE}/households/home/restaurants?documentId=${id}`, {
    headers: HEADERS,
    data: {
      fields: {
        name: s(over.name ?? `Seeded ${id}`),
        address: s("1 Seed Street, Testville"),
        createdBy: s("ava-uid"),
        createdAt: ts("2026-09-01T10:00:00Z"),
        updatedAt: ts("2026-09-01T10:00:00Z"),
        version: { integerValue: String(over.version ?? 1) },
        deleting: { booleanValue: over.deleting ?? false },
      },
    },
  });
  if (!res.ok()) throw new Error(`seedRestaurant ${id}: ${res.status()} ${await res.text()}`);
}

export async function seedClaim(request: APIRequestContext, rid: string, id: string, over: { kind?: string; value?: string; checkedAt?: string } = {}): Promise<void> {
  const res = await request.post(`${BASE}/households/home/restaurants/${rid}/claims?documentId=${id}`, {
    headers: HEADERS,
    data: {
      fields: {
        kind: s(over.kind ?? "gfMenu"),
        value: s(over.value ?? "yes"),
        detail: s("Seeded claim"),
        source: { mapValue: { fields: { type: s("restaurantStatement"), label: s("Seed") } } },
        checkedAt: ts(`${over.checkedAt ?? "2026-09-01"}T00:00:00Z`),
        authorUid: s("ava-uid"),
        authorName: s("Ava"),
        createdAt: ts("2026-09-01T10:00:00Z"),
      },
    },
  });
  if (!res.ok()) throw new Error(`seedClaim ${rid}/${id}: ${res.status()} ${await res.text()}`);
}

/** Models an interrupted deletion: step 1 (the mark) committed, nothing else. */
export async function markDeletingViaRest(request: APIRequestContext, rid: string): Promise<void> {
  const url = `${BASE}/households/home/restaurants/${rid}?updateMask.fieldPaths=deleting&updateMask.fieldPaths=version&updateMask.fieldPaths=updatedAt`;
  const res = await request.patch(url, {
    headers: HEADERS,
    data: { fields: { deleting: { booleanValue: true }, version: { integerValue: "2" }, updatedAt: ts("2026-09-02T10:00:00Z") } },
  });
  if (!res.ok()) throw new Error(`markDeleting ${rid}: ${res.status()} ${await res.text()}`);
}

export async function listRestaurantIds(request: APIRequestContext): Promise<string[]> {
  return (await listDocs(request, "households/home/restaurants")).map(idOf);
}

export async function listClaimIds(request: APIRequestContext, rid: string): Promise<string[]> {
  return (await listDocs(request, `households/home/restaurants/${rid}/claims`)).map(idOf);
}

export async function restaurantExists(request: APIRequestContext, rid: string): Promise<boolean> {
  const res = await request.get(`${BASE}/households/home/restaurants/${rid}`, { headers: HEADERS });
  return res.status() === 200;
}
