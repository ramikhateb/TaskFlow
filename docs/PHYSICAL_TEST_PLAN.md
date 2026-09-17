# V1 Physical-Device Test Plan

A step-by-step script for manually verifying the complete primary V1 journey on real iOS/Android devices via Expo Go. Use three accounts — **A**, **B**, **C**.

This is a script for a human to run. No step in this document has been executed by Claude — see `docs/ROADMAP.md` M11/M12 for what was verified by automated tests instead.

1. Register A, B, and C; log in as A.
2. Create a task with a title only; confirm it appears in Tasks.
3. Edit it: add a description, change priority and category; Save; confirm changes persist.
4. Set `scheduledAt` to today and a `deadline` a day later; confirm both are visible and distinct on the detail screen.
5. Try setting a `deadline` before `scheduledAt`; confirm you get a clear warning before saving, and the server also rejects it if you bypass the warning.
6. Open Today; confirm the task appears under the correct section (Scheduled Today or Due Today).
7. Open Schedule; page to the task's date with Prev/Next; confirm it appears there and nowhere else.
8. In Tasks, search by a keyword in the title, then apply a status/priority filter; confirm "no tasks match your filters" appears distinctly from the plain empty state when you clear everything with no tasks created.
9. From Profile, tap Find People, search for B by name and by `@username` (with and without the `@`); confirm B appears and A does not.
10. From the task's detail screen, tap "Assign to someone," select B, optionally add a message, and send.
11. As A: confirm the task is now frozen — editing, marking done, and deleting are all blocked with an explanation, but it's still fully visible.
12. As A: tap "Cancel Assignment"; confirm the task unfreezes immediately.
13. Send the same task to B again.
14. As B: open Inbox, find the request, tap Decline; confirm it disappears from B's Inbox and A's task unfreezes with no ownership change.
15. As A: send the task to B a third time.
16. As B: this time tap Accept, choose "Schedule it," pick a date/time before the deadline, and confirm. This is the **A → B assignment becoming ACCEPTED**; B is now the current assignee.
17. As A: check Sent — confirm the A → B request now shows "Accepted."
18. As B: confirm the task shows B's own chosen schedule (not A's), and that B now has full normal edit/complete/delete access to it.
19. As A: open the task (from Sent, or by any means available) — confirm it's read-only: you may `GET`/view it, but you may not `PATCH`/`DELETE` it or send a new assignment on it. It shows "Assigned to B" and never reveals B's chosen `scheduledAt`.
20. As B (the current assignee): tap "Assign to someone," select C, and send. As C: open Inbox and Accept. This is the **B → C assignment becoming ACCEPTED**; C is now the current assignee.
21. Confirm the resulting three-way state:
    - **As A** (original creator): you can still `GET`/view the live task read-only; you still cannot `PATCH`/`DELETE`/assign it. Your Sent list still shows your original **A → B** row (Accepted) — unaffected by the later B → C transfer.
    - **As B** (now a historical assignee only — no longer creator, no longer current assignee): opening the live task now behaves exactly like a stranger's attempt — not found. You may not `GET`/`PATCH`/`DELETE` it. Your Sent list still shows the **B → C** row you sent (Accepted). Note: accepting A's original request never added anything to your own Sent list — Sent only lists assignments *you sent*, never ones you received.
    - **As C** (current assignee): you have full normal access — view, edit, complete, delete, and you can send it on to someone else if you choose.
22. As C: mark the task Done; confirm it's visually distinct (strikethrough + a checkmark), not conveyed by color alone.
23. As any account: tap Sign Out from Profile; log in as a different account and immediately check Tasks/Inbox/Sent — confirm you see **only** that account's data, never a flash of the previous account's tasks or requests.
24. Turn off Wi-Fi briefly and try Save/Accept/Cancel; confirm a clear error appears rather than a silent failure, and retry after reconnecting.
25. Delete a task from both the Tasks-list row and from task detail; confirm both prompt a confirmation dialog before anything is removed, and that it's actually gone afterward.
