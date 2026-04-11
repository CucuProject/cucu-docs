# TEST_FRAMEWORK.md - Guida Completa al Framework di Test Cucu

## Stack

- **Playwright** — E2E testing framework (browser automation)
- **Vitest** — Test runner per unit/integration tests
- **@testing-library/dom** — Semantic DOM assertions
- **TypeScript** — Strict typing

---

## Architettura

```
tests/
├── e2e/                      # E2E tests (Playwright)
│   ├── helpers/              # Auth, utilities
│   ├── pages/                # Page Object Models (POM)
│   └── specs/                # E2E test files (.spec.ts)
├── integration/              # Integration tests (API + UI)
└── unit/                    # Unit tests (helpers, utils)
```

---

## Page Object Model (POM)

### Cos'è?

Il POM separa la logica di test dalla struttura della UI. Ogni pagina è una classe con metodi che rappresentano azioni utente.

### Perché usarlo?

- ✅ **Riusabilità** — Stesso POM per test multipli
- ✅ **Manutenibilità** — UI cambia → solo POM da aggiornare
- ✅ **Leggibilità** — Test leggibili e focalizzati

### Esempio

```typescript
import { Page, expect } from '@playwright/test';

export class ProfilePage {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/account/profile');
  }

  async editSection(section: string) {
    await this.page.getByRole('button', {
      name: new RegExp(`modifica.*${section}`, 'i'),
    }).click();
  }

  async isFieldDisabled(label: string): Promise<boolean> {
    const field = this.page.getByLabel(label);
    return await field.isDisabled();
  }
}
```

### Uso nei test

```typescript
import { test } from '@playwright/test';
import { ProfilePage } from './pages/ProfilePage';

test('edit mode enables fields', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();

  await profilePage.editSection('Dati anagrafici');
  const isDisabled = await profilePage.isFieldDisabled('Nome');

  expect(isDisabled).toBe(false);
});
```

---

## Test Helpers

### Auth Helpers (`tests/e2e/helpers/auth.ts`)

```typescript
import { login, logout, TEST_USERS } from './helpers/auth';

// Login come admin
await login(page, 'admin');

// Login come utente limitato
await login(page, 'limited-user');

// Logout
await logout(page);
```

### Utils (`tests/e2e/helpers/utils.ts`)

```typescript
import {
  waitForFieldEnabled,
  waitForFieldDisabled,
  saveForm,
  cancelForm,
} from './helpers/utils';

// Wait for field to be enabled
await waitForFieldEnabled(page, 'Nome');

// Wait for field to be disabled
await waitForFieldDisabled(page, 'Nome');

// Save form
await saveForm(page);

// Cancel form
await cancelForm(page);
```

---

## Scrittura Test E2E

### Struttura Base

```typescript
import { test, expect } from '@playwright/test';
import { login, logout } from './helpers/auth';
import { ProfilePage } from './pages/ProfilePage';

test.describe('Profile Page', () => {
  test.beforeEach(async ({ page }) => {
    await login(page, 'admin');
  });

  test.afterEach(async ({ page }) => {
    await logout(page);
  });

  test('view mode shows all sections', async ({ page }) => {
    const profilePage = new ProfilePage(page);
    await profilePage.goto();

    expect(await profilePage.isSectionVisible('Dati anagrafici')).toBe(true);
  });
});
```

### Best Practices

1. **Usa POM** — Mai interagire direttamente con la UI nei test
2. **Test una cosa per volta** — Un test = un assert
3. **Nomi descrittivi** — `test('edit mode enables fields')` non `test('test1')`
4. **Setup/teardown** — Usa `beforeEach`/`afterEach` per login/logout
5. **Assertion specifiche** — `expect(value).toBe(true)` non `expect(value).toBeTruthy()`

---

## Playwright Selectors

### `getByRole` — Accessible selector

```typescript
// Button
await page.getByRole('button', { name: 'Salva' }).click();

// Input
await page.getByRole('textbox', { name: 'Nome' }).fill('Mario');

// Checkbox
await page.getByRole('checkbox', { name: 'Attivo' }).check();
```

### `getByLabel` — Label-based selector

```typescript
const field = page.getByLabel('Nome');
await field.fill('Mario');
```

### `getByText` — Text-based selector

```typescript
await page.getByText('Dati anagrafici').toBeVisible();
```

### `getByPlaceholder` — Placeholder-based selector

```typescript
await page.getByPlaceholder('Inserisci il nome').fill('Mario');
```

---

## Run Tests

### Run su Ambiente Remoto (staging, production)

```bash
# Staging (default)
npm run test:e2e

# Production
npm run test:e2e:prod

# Local (localhost:4000)
npm run test:e2e:local
```

### Run con UI (headless=false)

```bash
npm run test:e2e:ui
```

### Run headed (mostra browser)

```bash
npm run test:e2e:headed
```

### Debug mode (pausa a ogni step)

```bash
npm run test:e2e:debug
```

### Run solo un file

```bash
npx playwright test profile-page.spec.ts
```

### Run solo un test

```bash
npx playwright test --grep "edit mode enables fields"
```

---

## Coverage

```bash
npm run test:coverage
```

Rapporto coverage in `coverage/`.

---

## Debug

### Playwright Inspector

```bash
npx playwright codegen http://localhost:4000
```

Questo apre un browser e registra le interazioni, generando il codice Playwright.

### Trace Viewer

Se un test fallisce, Playwright genera un trace file in `test-results/`. Puoi vederlo con:

```bash
npx playwright show-trace test-results/[test-name]/trace.zip
```

---

## Configurazione

### Ambienti Remoti

Il framework supporta test su ambienti multipli (local, staging, production):

```typescript
const ENV = process.env.TEST_ENV || 'staging';

const BASE_URLS: Record<string, string> = {
  local: 'http://localhost:4000',
  staging: 'https://staging.cucu.app',
  production: 'https://cucu.app',
};

const baseURL = BASE_URLS[ENV] || BASE_URLS.staging;
```

### playwright.config.ts

```typescript
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,  // Run tests sequentially
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  timeout: 30000,
  baseURL,  // Configurato dinamicamente dall'ambiente
  use: {
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: devices['Desktop Chrome'] },
  ],
});
```

### vitest.config.ts

```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/unit/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
      ],
    },
  },
});
```

---

## Remote Testing

### Prerequisiti

Per eseguire test su ambienti remoti (staging/production):

1. **Cucu Frontend** deve essere deployato e accessibile all'URL configurato
2. **Test users** devono esistere nel database dell'ambiente remoto:
   - `admin@cucu.local` — Con permessi admin
   - `limited@cucu.local` — Con permessi limitati
   - `noperms@cucu.local` — Senza permessi
3. **Login** funzionale sull'ambiente remoto
4. **Permissions system** funzionante sull'ambiente remoto

### Run Tests su Ambiente Remoto

```bash
# Staging (default)
npm run test:e2e

# Production
npm run test:e2e:prod

# Local
npm run test:e2e:local
```

### Configurare Nuovi Ambienti

Per aggiungere un nuovo ambiente (es: `development`):

1. Aggiorna `playwright.config.ts`:

```typescript
const BASE_URLS: Record<string, string> = {
  local: 'http://localhost:4000',
  staging: 'https://staging.cucu.app',
  production: 'https://cucu.app',
  development: 'https://dev.cucu.app',  // Nuovo ambiente
};
```

2. Aggiungi script in `package.json`:

```json
{
  "scripts": {
    "test:e2e:dev": "TEST_ENV=development playwright test"
  }
}
```

3. Run:

```bash
npm run test:e2e:dev
```

### Best Practices per Remote Testing

1. **Non testare su production per test quotidiani** — Usa staging
2. **Test data cleanup** — Assicurati che i test users esistano e siano puliti
3. **Test isolation** — Ogni test deve essere indipendente
4. **Environment variables** — Usa variabili d'ambiente per URLs e credentials
5. **Rate limiting** — Non eseguire troppi test in parallelo su remote (rispetto API limits)

## Prossimi Passi

1. **Aggiungere test specs** — `tests/e2e/specs/`
2. **Estendere POM** — Aggiungere nuovi Page Objects
3. **Integrazione CI/CD** — Run tests in GitHub Actions
4. **Coverage thresholds** — Definire minimum coverage

---

## Riferimenti

- [Playwright Docs](https://playwright.dev/)
- [Vitest Docs](https://vitest.dev/)
- [@testing-library/dom](https://testing-library.com/)
- [Page Object Model](https://playwright.dev/docs/pom)
