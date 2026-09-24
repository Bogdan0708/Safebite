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

const s = (v: string) => ({ stringValue: v });
const ts = (iso: string) => ({ timestampValue: iso });

export async function seedRestaurant(request: APIRequestContext, id: string, over: { name?: string; deleting?: boolean; version?: number; googlePlaceId?: string } = {}): Promise<void> {
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
        ...(over.googlePlaceId ? { googlePlaceId: s(over.googlePlaceId) } : {}),
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

/** Discovery kill switch and cap (functions read it with the Admin SDK; clients have no rules access). */
export async function setDiscoveryConfig(request: APIRequestContext, config: { enabled: boolean; dailySearchCap: number }): Promise<void> {
  const res = await request.patch(`${BASE}/config/discovery`, {
    headers: HEADERS,
    data: { fields: { enabled: { booleanValue: config.enabled }, dailySearchCap: { integerValue: String(config.dailySearchCap) } } },
  });
  if (!res.ok()) throw new Error(`setDiscoveryConfig: ${res.status()} ${await res.text()}`);
}

export async function deleteDiscoveryConfig(request: APIRequestContext): Promise<void> {
  const res = await request.delete(`${BASE}/config/discovery`, { headers: HEADERS });
  if (!res.ok() && res.status() !== 404) throw new Error(`deleteDiscoveryConfig: ${res.status()} ${await res.text()}`);
}

/** `day` is the UTC yyyymmdd key the functions use (households/home/usage/{day}). */
export async function setUsage(request: APIRequestContext, day: string, searches: number): Promise<void> {
  const res = await request.patch(`${BASE}/households/home/usage/${day}`, {
    headers: HEADERS,
    data: { fields: { searches: { integerValue: String(searches) } } },
  });
  if (!res.ok()) throw new Error(`setUsage ${day}: ${res.status()} ${await res.text()}`);
}

export async function clearUsage(request: APIRequestContext): Promise<void> {
  for (const d of await listDocs(request, "households/home/usage")) await del(request, `households/home/usage/${idOf(d)}`);
}

/**
 * Fields of one restaurant document, or null when it does not exist. Decodes stringValue,
 * booleanValue, integerValue and doubleValue (Firestore encodes a number with a fractional part,
 * such as a lat/lng, as doubleValue — decimal lat/lng would otherwise be silently dropped and a
 * `not.toHaveProperty("lat")` assertion could never fail). Any other Firestore value type is kept
 * as its raw `{ <type>: value }` object rather than dropped, so every stored field stays visible
 * to assertions.
 */
export async function getRestaurant(request: APIRequestContext, rid: string): Promise<Record<string, unknown> | null> {
  const res = await request.get(`${BASE}/households/home/restaurants/${rid}`, { headers: HEADERS });
  if (res.status() === 404) return null;
  if (!res.ok()) throw new Error(`getRestaurant ${rid}: ${res.status()} ${await res.text()}`);
  const body = (await res.json()) as RestDoc;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body.fields ?? {})) {
    const v = value as { stringValue?: string; booleanValue?: boolean; integerValue?: string; doubleValue?: number };
    if (v.stringValue !== undefined) out[key] = v.stringValue;
    else if (v.booleanValue !== undefined) out[key] = v.booleanValue;
    else if (v.integerValue !== undefined) out[key] = Number(v.integerValue);
    else if (v.doubleValue !== undefined) out[key] = v.doubleValue;
    else out[key] = value;
  }
  return out;
}

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
