import { doc, getDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { db } from "../firebase";
import { useMember } from "../records/useMember";
import { DeletePasswordForm } from "./DeletePasswordForm";

/** The text is advisory: the server's step 2 transaction decides who is last (spec §3.8). */
export function DeleteAccountPage() {
  const { householdId } = useMember();
  const [onlyMember, setOnlyMember] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    getDoc(doc(db, `households/${householdId}`))
      .then((snap) => {
        const ids: unknown = snap.exists() ? snap.get("memberIds") : undefined;
        if (live) setOnlyMember(Array.isArray(ids) && ids.length === 1);
      })
      .catch(() => { if (live) setOnlyMember(false); });
    return () => { live = false; };
  }, [householdId]);

  return (
    <section>
      <h2>Delete account</h2>
      {onlyMember !== null && (
        <p data-testid="delete-consequence">
          {onlyMember
            ? "You are the only member. Everything in the household is deleted."
            : "Your sign-in and your notes are deleted. Restaurants and evidence you added stay with the household, shown as 'Former member'."}
        </p>
      )}
      <p>This cannot be undone. <Link to="/settings" data-testid="export-first">Export first</Link></p>
      <DeletePasswordForm submitLabel="Delete my account" testid="delete" />
    </section>
  );
}
