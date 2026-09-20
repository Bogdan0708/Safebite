export type Membership =
  | { kind: "member"; householdId: string; displayName: string }
  | { kind: "notMember" };

/**
 * Pure membership resolution, mirroring the Firestore rule `isMember(hid)`.
 * Both documents are admin-written; the client only reads them.
 */
export function resolveMembership(
  uid: string,
  userDoc: Record<string, unknown> | undefined,
  householdDoc: Record<string, unknown> | undefined,
): Membership {
  const householdId = userDoc?.householdId;
  if (typeof householdId !== "string" || householdId.length === 0) return { kind: "notMember" };
  const memberIds = householdDoc?.memberIds;
  if (!Array.isArray(memberIds) || !memberIds.includes(uid)) return { kind: "notMember" };
  const displayName = userDoc?.displayName;
  return {
    kind: "member",
    householdId,
    displayName: typeof displayName === "string" ? displayName : "",
  };
}
