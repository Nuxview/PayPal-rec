# PayPal Rec

PayPal Rec helps merchants assemble evidence for a PayPal account limitation. The app foundation is in place; case creation, evidence uploads and reconstruction will land in later issues.

Use Node.js 24 (with `nvm`, run `nvm install` and `nvm use` in this directory).

```sh
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). [`/api/health`](http://localhost:3000/api/health) reports whether the app server is responding. The app starts without a database, PayPal credentials or AI configuration. The health route does not check those services.

Run the same checks as pull requests targeting `main`:

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

Run `npm start` after building to serve the production build locally. See the [database migration](db/README.md), the [synthetic agency case](fixtures/restriction-agency-v1/README.md) and the [contributor workflow](CONTRIBUTING.md) for the next pieces.
