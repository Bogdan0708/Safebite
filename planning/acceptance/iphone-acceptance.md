# Real-iPhone acceptance

Drafted in Plan 5b; Plan 5c extends this script and runs it against the finished pilot. Use a
real iPhone, the pilot URL, and a household account. Record the iOS version, date and result
of each step.

## Plan 5b — offline reading

Empirical stop 3 (spec §3.9) is part of this run.

1. In Safari, open the pilot and **Add to Home Screen**. Open the installed app and sign in.
2. Settings → **Keep a copy on this device**. Note whether "Your browser may remove this copy
   if the device runs low on space." appears (that is `navigator.storage.persist()` refusing).
   Wait for **Ready offline · updated …**.
3. Fully close the app (swipe it away). Turn on Airplane Mode. Reopen the app.
   Expected: the app opens with "Offline copy from …"; Saved lists the restaurants; a
   restaurant shows its evidence (with older evidence) and both members' notes; Add evidence
   and Save note are disabled; Discover says "Search needs a connection."
4. Turn Airplane Mode off. Expected within a minute: the banner disappears and editing works.
5. With the app open on Saved, turn Airplane Mode on (or walk out of signal). Open a restaurant
   you have not opened in this session. Expected: it shows from the copy with the banner.
6. Turn Airplane Mode off. Settings → **Sign out**. Sign in again. Expected: Settings shows
   "Not stored on this device." until the switch is turned on again.
7. Stop 3, browser tab: repeat steps 1–3 in a Safari tab instead of the installed app. Record
   whether the copy survives closing Safari, and what step 2 showed.
8. Optional, slow: leave the installed app unopened for 8 days, then repeat step 3 without
   reconnecting first. Expected: the copy still opens and the banner is amber ("over a week old").
9. Removal while online (spec §3.9 R2-4, browser test 12; needs a second household member's
   account on device A). With the app open and visible as that member on device A, on Saved,
   the owner removes the member on the server (owner action: take the UID out of the
   household's `memberIds`). Note the time. Record whether device A loses access at once
   (listener re-evaluation: the not-invited screen within seconds) or only at the next
   15-minute membership check (within 15 minutes, while the app stays visible). The emulator
   did not deny an open listener on a `memberIds` change alone, so this step is the production
   check. Expected either way: the not-invited screen, and Settings on that device no longer
   lists an offline copy. Re-add the member afterwards.
