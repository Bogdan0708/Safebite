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
