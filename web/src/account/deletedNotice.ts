import { takeDeletedNotice, type DeletedNotice } from "./storage";

/** Read once per document: React StrictMode runs state initialisers twice, and the read removes the key. */
let cached: DeletedNotice | null | undefined;
export function deletedNoticeOnce(): DeletedNotice | null {
  if (cached === undefined) cached = takeDeletedNotice();
  return cached;
}
