# PayPal Rec

PayPal Rec helps merchants assemble evidence for a PayPal account limitation. The synthetic agency demo shows how to review proposed matches and investigate gaps. Merchant case creation and uploads are not available in the web app yet.

Use Node.js 24 (with `nvm`, run `nvm install` and `nvm use` in this directory).

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). [`/api/health`](http://localhost:3000/api/health) reports whether the app server is responding. The app starts without a database, PayPal credentials or AI configuration. The health route does not check those services.

Open [the demo payment](http://localhost:3000/demo/payment) to see the labelled fixture in the app. For Sandbox capture lookup or storage in an existing case, see [Import a PayPal payment](docs/paypal-import.md).

To preview or store the agency documents or your own plain-text evidence, see [Import case documents](docs/document-import.md).

To capture the restriction notice and link its requests to the source text, see [Capture a restriction notice](docs/restriction-notice.md).

To propose cited matches for payment and delivery requests, see [Match evidence](docs/evidence-matching.md).

Open [the demo review screen](http://localhost:3000/demo/review) to inspect cited excerpts and accept or reject proposals. See [Review the agency case](docs/merchant-review.md) for the walkthrough.

Run the same checks as pull requests targeting `main`:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Run `npm start` after building to serve the production build locally. See the [database migration](db/README.md), the [synthetic agency case](fixtures/restriction-agency-v1/README.md) and the [contributor workflow](CONTRIBUTING.md) for the next pieces.
