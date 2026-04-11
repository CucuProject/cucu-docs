# E2E Testing Guide

> Repository: [CucuProject/cucu-frontend-e2e-tests](https://github.com/CucuProject/cucu-frontend-e2e-tests)
> Stack: Playwright + Vitest + @testing-library/dom

---

## Overview

Il framework di test E2E per Cucu Frontend è un sistema completo di end-to-end testing che permette di:

- **Testare l'applicazione su ambienti remoti** (local, staging, production)
- **Automatizzare flussi complessi** (login, multi-tenant, permissions, project access)
- **Verificare funzionalità critiche** (CRUD, sharing, access control)
- **Mantenere tests manutenibili** tramite Page Object Model (POM)

---

## Stack Tecnologico

| Componente | Versione | Scopo |
|-------------|-----------|--------|
| **Playwright** | ^1.58.2 | Browser automation per E2E tests |
| **Vitest** | ^4.1.4 | Test runner per unit/integration tests |
| **@testing-library/dom** | ^16.3.2 | Semantic DOM assertions |
| **@testing-library/jest-dom** | ^6.9.1 | Matchers per assertions |
| **@testing-library/user-event** | ^14.6.1 | Simulazione eventi utente |
| **TypeScript** | strict | Type safety |

---

## Repository Structure

```
cucu-frontend-e2e-tests/
├── tests/
│   ├── e2e/
│   │   ├── helpers/              # Utilities condivise
│   │   │   ├── auth.ts          # Login, logout, test users
│   │   │   └── utils.ts         # Utilities per form e wait
│   │   ├── pages/                # Page Object Models (POM)
│   │   │   ├── LoginPage.ts
│   │   │   ├── SignupPage.ts
│   │   │   ├── TenantSwitcher.ts
│   │   │   ├── ProjectsPage.ts
│   │   │   ├── ProjectTemplatesPage.ts
│   │   │   ├── ProfilePage.ts
│   │   │   ├── EditUserPage.ts
│   │   │   ├── GroupsPreviewPage.ts
│   │   │   └── CrudSettingsPage.ts
│   │   └── specs/                # Test files
│   │       ├── login-flow.spec.ts
│   │       ├── signup-flow.spec.ts
│   │       ├── tenant-switching.spec.ts
│   │       ├── permissions.spec.ts
│   │       ├── project-access.spec.ts
│   │       ├── projects.spec.ts
│   │       ├── project-templates.spec.ts
│   │       ├── profile-page.spec.ts
│   │       ├── edit-user-page.spec.ts
│   │       ├── groups-preview-page.spec.ts
│   │       └── crud-settings-page.spec.ts
│   ├── integration/               # Integration tests (da implementare)
│   └── unit/                     # Unit tests (da implementare)
├── playwright.config.ts           # Configurazione Playwright
├── vitest.config.ts             # Configurazione Vitest
├── package.json                 # Scripts e dipendenze
├── .gitignore                  # Esclude node_modules, test-results, coverage
├── README.md                   # Guida rapida
├── TEST_FRAMEWORK.md             # Documentazione completa framework
├── TEST_WRITING_GUIDE.md        # Come scrivere test
└── TESTING_BEST_PRACTICES.md     # Best practices
```

---

## Setup

### Prerequisiti

1. **Node.js** (v18 o superiore)
2. **Browser** (Chromium per headless, qualsiasi per headed)
3. **Ambiente di test:**
   - **Local:** Frontend su `http://localhost:4000`
   - **Staging:** Frontend su `https://staging.cucu.app`
   - **Production:** Frontend su `https://cucu.app`

### Installazione

```bash
# Clone repository
git clone https://github.com/CucuProject/cucu-frontend-e2e-tests.git
cd cucu-frontend-e2e-tests

# Installa dipendenze
npm install

# Installa Playwright browser
npx playwright install
```

### Configurazione Test Users

I test users devono esistere nel database dell'ambiente di test:

| User | Email | Password | Gruppi |
|-------|--------|-----------|---------|
| Admin | `admin@cucu.local` | `password123` | SUPERADMIN |
| Limited | `limited@cucu.local` | `password123` | LIMITED_USER |
| Viewer | `viewer@cucu.local` | `password123` | VIEWER |
| Multi-tenant | `multitenant@cucu.local` | `password123` | HR, PM |
| Collaborator | `collaborator@cucu.local` | `password123` | COLLABORATOR |
| Editor | `editor@cucu.local` | `password123` | EDITOR |
| No perms | `noperms@cucu.local` | `password123 | — |

---

## Come Eseguire i Test

### Run su Ambiente Specifico

```bash
# Local (localhost:4000)
npm run test:e2e:local

# Staging (https://staging.cucu.app)
npm run test:e2e:staging

# Production (https://cucu.app)
npm run test:e2e:prod

# Default (staging se TEST_ENV non specificato)
npm run test:e2e
```

### Run con UI

```bash
# Apre UI di Playwright per selezionare test e vedere esecuzione
npm run test:e2e:ui
```

### Run Headed

```bash
# Mostra browser durante esecuzione
npm run test:e2e:headed
```

### Debug Mode

```bash
# Mette in pausa a ogni step, utile per debug
npm run test:e2e:debug
```

### Run Tutto (Unit + E2E)

```bash
npm run test:all
```

---

## Page Object Model (POM)

Il POM è un pattern che separa la logica di test dalla struttura della UI. Ogni pagina è una classe con metodi che rappresentano azioni utente.

### Struttura di un POM

```typescript
import { Page, expect } from '@playwright/test';

export class ProjectsPage {
  constructor(private page: Page) {}

  // Navigation
  async goto() {
    await this.page.goto('/projects');
  }

  async gotoWithSlug(tenantSlug: string) {
    await this.page.goto(`/t/${tenantSlug}/projects`);
  }

  // Actions
  async clickCreateProject() {
    const createButton = this.page.getByRole('button', {
      name: /create.*project/i,
    });
    await createButton.click();
  }

  // State checks
  async isCreateProjectButtonVisible(): Promise<boolean> {
    const createButton = this.page.getByRole('button', {
      name: /create.*project/i,
    });
    return await createButton.isVisible();
  }

  // Form interactions
  async fillProjectName(name: string) {
    const nameInput = this.page.getByLabel(/project.*name/i);
    await nameInput.fill(name);
  }

  async saveProject() {
    const saveButton = this.page.getByRole('button', { name: /save/i });
    await saveButton.click();
  }
}
```

### Usare un POM in un Test

```typescript
import { test, expect } from '@playwright/test';
import { ProjectsPage } from '../pages/ProjectsPage';

test('should create new project', async ({ page }) => {
  const projectsPage = new ProjectsPage(page);

  // Navigate to page
  await projectsPage.goto();

  // Perform actions
  await projectsPage.clickCreateProject();
  await projectsPage.fillProjectName('Test Project');
  await projectsPage.saveProject();

  // Verify result
  await expect(projectsPage.isProjectVisible('Test Project')).resolves.toBe(
    true,
  );
});
```

---

## Come Scrivere un Test

### Template Base

```typescript
import { test, expect } from '@playwright/test';
import { login } from '../helpers/auth';
import { ProjectsPage } from '../pages/ProjectsPage';

test.describe('Projects CRUD', () => {
  let projectsPage: ProjectsPage;

  test.beforeEach(async ({ page }) => {
    // Setup before each test
    await login(page, 'admin');
    projectsPage = new ProjectsPage(page);
    await projectsPage.goto();
  });

  test('should create project successfully', async ({ page }) => {
    // Arrange
    const projectName = `Test Project ${Date.now()}`;

    // Act
    await projectsPage.clickCreateProject();
    await projectsPage.fillProjectName(projectName);
    await projectsPage.saveProject();

    // Assert
    await projectsPage.goto(); // Refresh
    await expect(projectsPage.isProjectVisible(projectName)).resolves.toBe(true);
  });

  test('should validate required fields', async ({ page }) => {
    // Act
    await projectsPage.clickCreateProject();
    await projectsPage.saveProject();

    // Assert
    await expect(page.getByText(/name.*required/i)).toBeVisible();
  });
});
```

### Best Practices per Scrittura Test

1. **Test focalizzati** — Ogni test verifica UNA cosa
2. **Indipenti** — Ogni test deve poter girare da solo
3. **Usa POM** — Mai interagire direttamente con UI selectors nei test
4. **Wait strategici** — Usa `expect().toBeVisible()` invece di `waitForTimeout()`
5. **Assertions specifici** — Sii specifico su cosa stai verificando
6. **Nomi descrittivi** — `should create project successfully` è meglio di `test 1`

### Pattern Comuni

#### Login Multi-Tenant

```typescript
test('should login with tenant discovery', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.goto();

  // Email discovery
  await loginPage.discoverTenants('admin@cucu.local');
  await loginPage.waitForTenantList();

  // Select tenant
  await loginPage.selectTenant('acme');
  await loginPage.enterPassword('password123');
  await loginPage.submitLogin();

  // Verify
  await loginPage.waitForDashboard();
  await expect(loginPage.isOnDashboard()).resolves.toBe(true);
});
```

#### Verifica Permissions

```typescript
test('admin can create projects, viewer cannot', async ({ page }) => {
  // Test as admin
  await login(page, 'admin');
  const adminPage = new ProjectsPage(page);
  await adminPage.goto();
  await expect(adminPage.isCreateProjectButtonVisible()).resolves.toBe(true);

  // Test as viewer
  await page.goto('/login');
  await login(page, 'viewer');
  const viewerPage = new ProjectsPage(page);
  await viewerPage.goto();
  await expect(viewerPage.isCreateProjectButtonVisible()).resolves.toBe(false);
});
```

#### CRUD Operations

```typescript
test('should create, edit, and delete template', async ({ page }) => {
  await login(page, 'admin');
  const templatesPage = new ProjectTemplatesPage(page);
  await templatesPage.goto();

  // Create
  await templatesPage.clickCreateTemplate();
  await templatesPage.fillTemplateName('Test Template');
  await templatesPage.saveTemplate();

  // Edit
  await templatesPage.openTemplate('Test Template');
  await templatesPage.fillTemplateName('Updated Template');
  await templatesPage.saveTemplate();

  // Delete (if UI supports)
  await templatesPage.openTemplate('Updated Template');
  await page.getByRole('button', { name: /delete/i }).click();
  await templatesPage.confirmDelete();

  // Verify
  await templatesPage.goto();
  await expect(templatesPage.isTemplateVisible('Updated Template')).resolves.toBe(
    false,
  );
});
```

---

## Copertura Test

### POM Disponibili (9)

1. **LoginPage** — Login, tenant discovery, multi-tenant
2. **SignupPage** — Signup multi-tenant, auto-slug
3. **TenantSwitcher** — Switch tra tenant senza re-login
4. **ProjectsPage** — CRUD progetti, ricerca, filtro
5. **ProjectTemplatesPage** — CRUD template, phases, sharing
6. **ProfilePage** — Profilo utente, auth data, personal data
7. **EditUserPage** — Modifica user, edit mode
8. **GroupsPreviewPage** — Anteprima gruppi, field toggle
9. **CrudSettingsPage** — CRUD settings (seniority, job roles, ecc.)

### Test Specs Disponibili (11)

| Spec | Test Cases | Coverage |
|------|-------------|----------|
| **login-flow.spec.ts** | 8 | Email discovery, tenant selection, login, errors |
| **signup-flow.spec.ts** | 6 | Auto-slug, validation, create tenant |
| **tenant-switching.spec.ts** | 8 | Switch tenant, auth preservation |
| **permissions.spec.ts** | 15 | Field, page, operation permissions |
| **project-access.spec.ts** | 13 | Access levels, share, revoke, transfer |
| **projects.spec.ts** | 15 | CRUD, validation, filter, search |
| **project-templates.spec.ts** | 30+ | CRUD, phases, sharing, access |
| **profile-page.spec.ts** | 12 | View mode, edit mode, permissions |
| **edit-user-page.spec.ts** | 13 | Edit mode, permissions, save/cancel |
| **groups-preview-page.spec.ts** | 11 | Sections, field toggle, permissions |
| **crud-settings-page.spec.ts** | 14 | CRUD, permissions, inline edit |

**Totale:** ~145 test cases

---

## Debugging

### Modalità Debug

```bash
npm run test:e2e:debug
```

Questa modalità:
1. Mette in pausa a ogni step
2. Mostra browser con DevTools aperti
3. Permette di step-through il test

### Visualizzazione Test

```bash
npm run test:e2e:ui
```

Apre UI di Playwright dove puoi:
- Selezionare test specifici
- Guardare esecuzione in tempo reale
- Vedere screenshots e video
- Analizzare trace files

### Screenshots e Video

I test catturano automaticamente:
- **Screenshot** — Solo su failure (`screenshot: 'only-on-failure'`)
- **Video** — Solo su failure (`video: 'retain-on-failure'`)
- **Trace** — Solo su failure (`trace: 'retain-on-failure'`)

I file sono salvati in `playwright-report/`.

### Assertions Utile

```typescript
// Verifica elemento esiste
await expect(element).toBeVisible();

// Verifica elemento non esiste
await expect(element).not.toBeVisible();

// Verifica testo
await expect(page.getByText('Some text')).toBeVisible();

// Verifica URL
await expect(page).toHaveURL(/\/projects/);

// Verifica input value
await expect(input).toHaveValue('some value');

// Verifica numero elementi
await expect(page.locator('.item')).toHaveCount(3);
```

---

## CI/CD Integration

Per integrare i test nel CI/CD (es: GitHub Actions):

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e:staging
      - uses: actions/upload-artifact@v3
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
```

---

## Troubleshooting

### Test Timeout

**Problema:** Test fallisce con timeout.

**Soluzioni:**
1. Aumenta timeout nel test: `test.setTimeout(60000);`
2. Usa `expect().toBeVisible({ timeout: 10000 })`
3. Controlla se backend/frontend sono lenti
4. Verifica se c'è un loading state non gestito

### Elemento Non Trovato

**Problema:** `locator.click: Target closed` o `Element not found`.

**Soluzioni:**
1. Usa `expect().toBeVisible()` prima dell'azione
2. Usa `await page.waitForLoadState('networkidle')`
3. Controlla se c'è un modal/overlay che blocca
4. Verifica se selector è corretto

### Test Instabili (Flaky)

**Problema:** Test passa a volte e fallisce altre.

**Soluzioni:**
1. Aumenta `retries` in `playwright.config.ts`
2. Usa wait strategici invece di `waitForTimeout()`
3. Rendi test più indipenti (non dipendere da stato condiviso)
4. Controlla se c'è race condition

### Auth Fallisce

**Problema:** Login fallisce con credentials errori.

**Soluzioni:**
1. Verifica test users esistono nel database
2. Controlla password in `TEST_USERS` helper
3. Verifica backend è in esecuzione
4. Controlla se session cookie scaduto

---

## Riferimenti

- **Playwright Documentation:** https://playwright.dev
- **Vitest Documentation:** https://vitest.dev
- **Testing Library:** https://testing-library.com
- **Cucu Documentation:** [CucuProject/cucu-docs](https://github.com/CucuProject/cucu-docs)

---

## Supporto

Per problemi o domande:
1. Controlla questa guida
2. Leggi `TEST_FRAMEWORK.md`, `TEST_WRITING_GUIDE.md`, `TESTING_BEST_PRACTICES.md` nel repo test
3. Apri issue su [cucu-frontend-e2e-tests](https://github.com/CucuProject/cucu-frontend-e2e-tests/issues)
4. Chiedi su [Discord CucuProject](https://discord.gg/clawd)
