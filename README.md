# PayPal Rec

PayPal Rec helps merchants assemble evidence for a PayPal account limitation. The synthetic agency demo shows how to review proposed matches and investigate gaps. The private Sandbox workspace creates or imports a PayPal test capture and uses documents supplied for that case.

Use Node.js 26 (with `nvm`, run `nvm install` and `nvm use` in this directory). The package engine allows Node.js 24 through 26; `.nvmrc` and CI select 26.

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). [`/api/health`](http://localhost:3000/api/health) reports whether the app server is responding. The app starts without a database, PayPal credentials or AI configuration. The health route does not check those services.

Open [the demo payment](http://localhost:3000/demo/payment) to see the labelled fixture in the app. For Sandbox capture lookup or storage in an existing case, see [Import a PayPal payment](docs/paypal-import.md).

To preview or store the agency documents or your own plain-text evidence, see [Import case documents](docs/document-import.md).

To capture the restriction notice and link its requests to the source text, see [Capture a restriction notice](docs/restriction-notice.md).

To propose cited matches for payment and delivery requests, see [Match evidence](docs/evidence-matching.md).

Open [the demo review screen](http://localhost:3000/demo/review) to inspect cited excerpts, accept or reject proposals, and download the reviewed PDF and JSON in a ZIP. See [Review the agency case](docs/merchant-review.md) for the walkthrough.

For a browser-only presentation, open **Demo case** or configure the [PayPal Sandbox workspace](docs/paypal-sandbox-workspace.md) before recording. In Sandbox you can create, approve and capture a test order, add evidence, review cited proposals and download the packet without switching to a terminal.

To host the presentation, see [Deploy to Vercel with MongoDB](docs/vercel-deployment.md). The synthetic demo works without external services. The private Sandbox workspace uses MongoDB on Vercel.

Matching uses deterministic rules for the documented text formats. The optional [AI evidence gap review](docs/ai-evidence-review.md) reads case excerpts and suggests what evidence to gather next, separately from accepted claims and export. A shared key unlocks the private Sandbox workspace. Individual reviewer credentials authorize evidence edits and versioned review decisions stored in MongoDB. The synthetic demo saves decisions in the browser. See the [Sandbox workspace guide](docs/paypal-sandbox-workspace.md) for setup and retention.

Run the same checks as pull requests targeting `main`:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Run `npm start` after building to serve the production build locally. See the [database migration](db/README.md), the [synthetic agency case](fixtures/restriction-agency-v1/README.md) and the [contributor workflow](CONTRIBUTING.md) for the next pieces.

For the demo run order, explicit replay fallback and repeatable production HTTP check (`npm run demo:rehearse`), see the [demo rehearsal](docs/demo-rehearsal.md). Deferred server review history and complete request coverage are tracked in the [packet-trust backlog](docs/packet-trust-backlog.md).

The browser Sandbox workspace accepts UTF-8 `.txt` files in the documented formats. Its download is a review draft. For an actual limitation, the merchant submits the requested original records directly through PayPal. Use **Update case evidence** to correct an existing MongoDB case. See the [Sandbox setup and handoff](docs/paypal-sandbox-workspace.md).

## License

Copyright (C) 2026 Shadrackbond. Licensed under the [GNU General Public License, version 3 only](LICENSE).
