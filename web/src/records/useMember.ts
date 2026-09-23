import { useAuth } from "../auth/AuthProvider";

/** Pages under the member shell only render for members; anything else is a programming error. */
export function useMember(): { uid: string; householdId: string; displayName: string } {
  const { state } = useAuth();
  if (state.status !== "member") throw new Error("useMember used outside a member session");
  return { uid: state.uid, householdId: state.householdId, displayName: state.displayName };
}
