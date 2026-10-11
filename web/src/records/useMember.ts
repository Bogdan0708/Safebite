import { useAuth } from "../auth/AuthProvider";

/** Pages under the member shell render for members and, from the device copy, for offline members (spec §3.9). */
export function useMember(): { uid: string; householdId: string; displayName: string } {
  const { state } = useAuth();
  if (state.status !== "member" && state.status !== "offlineMember") throw new Error("useMember used outside a member session");
  return { uid: state.uid, householdId: state.householdId, displayName: state.displayName };
}
