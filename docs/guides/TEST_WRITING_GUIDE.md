# TEST_WRITING_GUIDE.md - Come Scrivere Test E2E con Playwright

## Introduzione

Questa guida spiega come scrivere test E2E per Cucu Frontend usando Playwright.

---

## Prerequisiti

1. Leggere `TEST_FRAMEWORK.md` per capire l'architettura
2. Conoscere Playwright e Page Object Model
3. Capire la UI di Cucu (pagine, sezioni, campi)

---

## Struttura di un Test

### Template Base

```typescript
import { test, expect } from '@playwright/test';
import { login, logout } from './helpers/auth';
import { PageObjectType } from './pages/PageObjectType';

test.describe('Feature Name', () => {
  test.beforeEach(async ({ page }) => {
    // Setup: login, navigate, etc.
    await login(page, 'admin');
  });

  test.afterEach(async ({ page }) => {
    // Teardown: logout, cleanup, etc.
    await logout(page);
  });

  test('test case description', async ({ page }) => {
    // Arrange: setup initial state
    const pageObj = new PageObjectType(page);
    await pageObj.goto();

    // Act: perform action
    await pageObj.doSomething();

    // Assert: verify outcome
    const result = await pageObj.getResult();
    expect(result).toBe(expected);
  });
});
```

---

## Naming Convention

### Test file

`[feature]-[page].spec.ts`

Esempi:
- `profile-page.spec.ts`
- `edit-user-page.spec.ts`
- `groups-preview-page.spec.ts`
- `crud-settings-page.spec.ts`

### Test describe

```typescript
test.describe('Profile Page — Permissioned Pattern', () => {
  // ...
});
```

### Test case

```typescript
test('view mode shows all sections', async ({ page }) => {
  // ...
});

test('edit mode enables auth data fields', async ({ page }) => {
  // ...
});

test('limited user cannot edit fields (permissions check)', async ({ page }) => {
  // ...
});
```

**Regola:**
- `[action] [result]` — es: `edit mode enables fields`
- `[user] cannot [action] ([context])` — es: `limited user cannot edit fields (permissions check)`

---

## Pattern Comuni

### Pattern 1 — View Mode

```typescript
test('view mode shows all sections', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();

  // Verify sections are visible
  expect(await profilePage.isSectionVisible('Dati anagrafici')).toBe(true);
  expect(await profilePage.isSectionVisible('Dati personali')).toBe(true);
});

test('view mode fields are disabled (read-only)', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();

  // Verify fields are disabled
  expect(await profilePage.isFieldDisabled('Nome')).toBe(true);
  expect(await profilePage.isFieldDisabled('Cognome')).toBe(true);
});
```

### Pattern 2 — Edit Mode

```typescript
test('edit mode enables fields', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();

  // Enter edit mode
  await profilePage.editSection('Dati anagrafici');
  await waitForPermissionsToLoad(page);

  // Verify fields are enabled
  expect(await profilePage.isFieldEnabled('Nome')).toBe(true);
  expect(await profilePage.isFieldEnabled('Cognome')).toBe(true);
});
```

### Pattern 3 — Save Form

```typescript
test('save form updates data', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();

  // Enter edit mode
  await profilePage.editSection('Dati anagrafici');

  // Fill field
  await profilePage.fillField('Nome', 'Mario');

  // Save
  await profilePage.saveForm();

  // Verify save button disappears (back to view mode)
  await profilePage.waitForViewMode();

  // Verify new value is visible
  const nameValue = await profilePage.getFieldValue('Nome');
  expect(nameValue).toBe('Mario');
});
```

### Pattern 4 — Cancel Edit

```typescript
test('cancel edit returns to view mode', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();

  // Enter edit mode
  await profilePage.editSection('Dati anagrafici');

  // Cancel
  await profilePage.cancelForm();

  // Verify back to view mode (fields disabled again)
  expect(await profilePage.isFieldDisabled('Nome')).toBe(true);
});
```

### Pattern 5 — Permissions Check

```typescript
test('limited user cannot edit fields (permissions check)', async ({ page }) => {
  // Login as limited user
  await login(page, 'limited-user');
  const profilePage = new ProfilePage(page);
  await profilePage.goto();

  // Enter edit mode
  await profilePage.editSection('Dati anagrafici');
  await waitForPermissionsToLoad(page);

  // Verify fields are disabled (permissions check)
  expect(await profilePage.isFieldDisabled('Nome')).toBe(true);
});

test('admin user can edit all fields', async ({ page }) => {
  // Login as admin
  await login(page, 'admin');
  const profilePage = new ProfilePage(page);
  await profilePage.goto();

  // Enter edit mode
  await profilePage.editSection('Dati anagrafici');
  await waitForPermissionsToLoad(page);

  // Verify fields are enabled
  expect(await profilePage.isFieldEnabled('Nome')).toBe(true);
  expect(await profilePage.isFieldEnabled('Cognome')).toBe(true);
});
```

### Pattern 6 — CRUD Operations

```typescript
test('create new item shows form', async ({ page }) => {
  const crudPage = new CrudSettingsPage(page);
  await crudPage.goto('job-roles');

  // Create new item
  await crudPage.createNew();

  // Verify form fields are visible
  expect(await crudPage.isFieldVisible('Name')).toBe(true);
  expect(await crudPage.isFieldVisible('Description')).toBe(true);
});

test('save form adds row', async ({ page }) => {
  const crudPage = new CrudSettingsPage(page);
  await crudPage.goto('job-roles');

  // Get initial row count
  const initialCount = await crudPage.getRowCount();

  // Create new item
  await crudPage.createNew();
  await crudPage.fillField('Name', 'New Role');
  await crudPage.saveForm();

  // Verify new row is added
  await crudPage.waitForViewMode();
  const newCount = await crudPage.getRowCount();
  expect(newCount).toBe(initialCount + 1);
});

test('delete item removes row', async ({ page }) => {
  const crudPage = new CrudSettingsPage(page);
  await crudPage.goto('job-roles');

  // Get initial row count
  const initialCount = await crudPage.getRowCount();

  // Delete first row
  await crudPage.deleteRow(0);
  await crudPage.confirmDelete();

  // Verify row is removed
  await crudPage.waitForTable();
  const newCount = await crudPage.getRowCount();
  expect(newCount).toBe(initialCount - 1);
});
```

---

## Assertion Guidelines

### ✅ Good Assertions

```typescript
// Specific assertion
expect(await profilePage.isFieldDisabled('Nome')).toBe(true);
expect(nameValue).toBe('Mario');

// Explicit boolean check
expect(await crudPage.isSectionVisible('Header')).toBe(true);

// Comparison
expect(newCount).toBe(initialCount + 1);
```

### ❌ Bad Assertions

```typescript
// Vague assertions
expect(value).toBeTruthy();
expect(value).not.toBeNull();

// No assertion
await profilePage.fillField('Nome', 'Mario');  // Missing assert

// Multiple assertions in one test (without separation)
expect(await profilePage.isFieldDisabled('Nome')).toBe(true);
expect(await profilePage.isFieldDisabled('Cognome')).toBe(true);
expect(await profilePage.isFieldDisabled('Email')).toBe(true);
// Split into multiple tests instead
```

---

## Wait Strategies

### Preferire `expect` con timeout

```typescript
// ✅ Good: expect with timeout
await expect(profilePage.getByText('Dati anagrafici')).toBeVisible({ timeout: 5000 });

// ❌ Bad: manual wait
await page.waitForTimeout(5000);
expect(await profilePage.isSectionVisible('Dati anagrafici')).toBe(true);
```

### Custom wait helpers

```typescript
// ✅ Good: use helper from utils
await waitForFieldEnabled(page, 'Nome');

// ❌ Bad: manual implementation
const field = page.getByLabel('Nome');
while (await field.isDisabled()) {
  await page.waitForTimeout(100);
}
```

---

## Test Isolation

### Ogni test deve essere indipendente

```typescript
test('edit mode enables fields', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();
  // ... test code
});

test('cancel edit returns to view mode', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();  // Start fresh, don't rely on previous test
  // ... test code
});
```

### Usare `beforeEach`/`afterEach` per shared setup

```typescript
test.beforeEach(async ({ page }) => {
  await login(page, 'admin');
});

test.afterEach(async ({ page }) => {
  await logout(page);
});

test('test 1', async ({ page }) => {
  // Already logged in
});

test('test 2', async ({ page }) => {
  // Already logged in, fresh state
});
```

---

## Debugging

### Playwright Inspector

```bash
npx playwright codegen http://localhost:4000
```

Genera codice Playwright registrando interazioni.

### Debug mode

```bash
npm run test:e2e:debug
```

Pausa il test a ogni step, permette di esplorare il DOM.

### Trace Viewer

```bash
npx playwright show-trace test-results/[test-name]/trace.zip
```

Visualizza trace di un test fallito (screenshot, video, network).

---

## Common Mistakes

### ❌ Non usare POM

```typescript
// ❌ Bad: direct UI interaction in test
test('edit mode enables fields', async ({ page }) => {
  await page.goto('/account/profile');
  await page.getByRole('button', { name: 'Modifica' }).click();
  const field = page.getByLabel('Nome');
  expect(await field.isDisabled()).toBe(false);
});

// ✅ Good: use POM
test('edit mode enables fields', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();
  await profilePage.editSection('Dati anagrafici');
  expect(await profilePage.isFieldDisabled('Nome')).toBe(false);
});
```

### ❌ Non usare helpers

```typescript
// ❌ Bad: duplicate code
test('login as admin', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'admin@cucu.local');
  await page.fill('input[type="password"]', 'password');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
});

// ✅ Good: use helper
test('login as admin', async ({ page }) => {
  await login(page, 'admin');
});
```

### ❌ Wait non necessari

```typescript
// ❌ Bad: unnecessary waits
await page.waitForTimeout(1000);
await page.waitForTimeout(500);
await page.waitForTimeout(200);

// ✅ Good: use expect with timeout
await expect(page.getByText('Dati anagrafici')).toBeVisible({ timeout: 2000 });
```

---

## Prossimi Passi

1. **Scrivi il tuo primo test** — Scegli una pagina semplice (es: Profile page)
2. **Esegui il test** — `npm run test:e2e`
3. **Debug se fallisce** — Usa `npm run test:e2e:debug`
4. **Refactor** — Migliora il test e il POM
5. **Repeat** — Aggiungi test per tutte le pagine

---

## Riferimenti

- [Playwright Docs](https://playwright.dev/)
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Writing Good E2E Tests](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library-test-cases)
