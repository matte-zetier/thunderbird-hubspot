# CLAUDE.md

## Project Overview

A Thunderbird WebExtension (MailExtension) that integrates with the HubSpot CRM API, emulating the behavior of the HubSpot Chrome extension — logging emails, surfacing contact/deal context, and syncing activity from within Thunderbird.

## Development Commands

```bash
# Install dependencies
npm install

# Development — two terminals required:
npm run dev          # terminal 1: esbuild in watch mode → dist/
npm run dev:ext      # terminal 2: web-ext loads dist/ into Thunderbird

# Full build + package to .xpi (runs typecheck first)
npm run build

# Type-check without emitting
npm run typecheck

# Lint TypeScript source
npm run lint

# Run tests in watch mode
npm test

# Run tests once (CI)
npm run test:run

# Run tests with coverage report (enforces 80% threshold)
npm run test:coverage
```

## Architecture

This is a Thunderbird **MailExtension** — a WebExtension that uses both standard WebExtension APIs and Thunderbird-specific `messenger.*` APIs.

### Key concepts

- **`manifest.json`** — Extension entry point. Must include `"applications": {"gecko": {"id": "...", "strict_min_version": "78.0"}}`. Uses `"mail_extension": true` or `"browser_specific_settings"` depending on TB version target.
- **Background script / service worker** — Owns HubSpot API communication, OAuth token management, and event listeners (`messenger.messages.onNewMailReceived`, etc.).
- **Popup / sidebar** — UI panels rendered for compose windows or message display, showing HubSpot contact/deal context.
- **Experiment APIs** — When standard MailExtension APIs are insufficient, Thunderbird allows `experiments` (privileged JS with chrome access). Use sparingly.

### Thunderbird-specific APIs

Thunderbird exposes `messenger.*` (analogous to `chrome.*`/`browser.*`), including:
- `messenger.messages` — read/search messages
- `messenger.compose` — hook into compose windows
- `messenger.contacts` / `messenger.addressBooks` — address book access
- `messenger.tabs` / `messenger.windows` — UI management

### HubSpot integration

- OAuth 2.0 via `identity.launchWebAuthFlow` for token acquisition
- Store tokens in `messenger.storage.local` (never in code)
- Key API surfaces: Contacts, Companies, Deals, Engagements (email logging), Timeline

### Build pipeline

TypeScript source lives in `src/`. `esbuild` (`scripts/build.js`) bundles each entry point into `dist/` and copies static assets (manifest.json, HTML, icons). `web-ext` then loads `dist/` as the live extension. `tsc --noEmit` is used only for type-checking; esbuild handles compilation.

### File layout

```
manifest.json                         # Extension manifest (copied to dist/ at build time)
icons/                                # Toolbar button icons (SVG)
scripts/build.js                      # esbuild build + asset copy script
src/
  background/index.ts                 # Background script — event listeners, owns no UI
  popup/
    message-display/                  # Popup shown when reading a message
      index.ts
      index.html
    compose/                          # Popup shown in the compose window
      index.ts
      index.html
  api/                                # HubSpot API client (to be built)
  types/messenger.d.ts                # Global type declaration for the `messenger` runtime object
  __mocks__/                          # Shared test infrastructure — never import in source files
dist/                                 # Build output — not committed, loaded by web-ext
```

## Testing

### Stack

- **Vitest** — test runner and assertion library (`describe`, `it`, `expect` are global, no imports needed)
- **msw (Mock Service Worker)** — intercepts `fetch` calls at the network level to mock HubSpot API responses
- **TypeScript strict mode + ESLint strictTypeChecked** — catch type errors and unsafe patterns before tests run
- **`@vitest/eslint-plugin`** — test-aware lint rules applied to `*.test.ts` / `*.spec.ts` files

### Linting rules for test files

| Rule | What it catches |
|---|---|
| `vitest/no-focused-tests` | `.only` accidentally left in, which would silently skip every other test |
| `vitest/expect-expect` | Tests that make no assertions and always pass vacuously |
| `vitest/no-standalone-expect` | `expect()` called outside a test body (e.g. in a helper without a test) |
| `vitest/valid-expect` | `expect(value)` with no matcher — the assertion never runs |
| `vitest/prefer-strict-equal` | `toEqual` instead of `toStrictEqual`, which ignores `undefined` properties |
| `vitest/no-disabled-tests` | `.skip` left on a test (warning, not error — skips are sometimes intentional) |

### How mocking works

`vitest.setup.ts` runs before every test file and wires up two things:

1. **`messenger` global** — injected via `vi.stubGlobal` using `src/__mocks__/messenger.ts`. This simulates the runtime object Thunderbird provides. Add new `messenger.*` properties to that file as you use them in source code.

2. **msw server** — started with `onUnhandledRequest: 'error'`, meaning any HubSpot API call your code makes that isn't covered by a handler will **fail the test loudly**. Default handlers live in `src/__mocks__/handlers.ts`.

### Patterns

Override a default handler for a specific test:

```ts
import { http, HttpResponse } from 'msw'
import { server } from '../__mocks__/server'
import { HUBSPOT_API_BASE } from '../__mocks__/handlers'

it('handles a 401 from HubSpot', async () => {
  server.use(
    http.get(`${HUBSPOT_API_BASE}/crm/v3/objects/contacts`, () =>
      HttpResponse.json({ message: 'Unauthorized' }, { status: 401 }),
    ),
  )
  // ... test your error handling
})
```

Assert on `messenger` API calls:

```ts
it('saves the token after auth', async () => {
  await authenticateWithHubSpot()
  expect(messengerMock.storage.local.set).toHaveBeenCalledWith(
    expect.objectContaining({ accessToken: expect.any(String) }),
  )
})
```

`vi.clearAllMocks()` runs after each test (in `vitest.setup.ts`), so call counts reset automatically — you never need to clear them manually.
