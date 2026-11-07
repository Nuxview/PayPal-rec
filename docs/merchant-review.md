# Review the agency case

Run `npm ci` and `npm run dev`, then open [the review screen](http://localhost:3000/demo/review). It runs the matcher against the synthetic agency inputs. It does not require a database, PayPal credentials or the evaluation answer key.

1. Open **Inspect citations** on a proposed match. Select a citation to see its source name and original line text or JSON field value.
2. Accept or reject the proposal. You can change your decision and reload the page to verify it is saved. Neither action edits the original evidence.
3. Open **Needs follow-up** to inspect the payer mismatch and the missing receipt for D3. These findings and the excluded handoff are visible for investigation and cannot be accepted as supported matches.

Decisions for this demo stay in the current browser. They are tied to the current report and source snapshots, so a changed evidence set starts with pending decisions. The screen does not open arbitrary merchant cases, submit anything to PayPal, or export a packet.
