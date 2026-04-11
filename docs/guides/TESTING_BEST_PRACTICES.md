# TESTING_BEST_PRACTICES.md - Best Practices per Test Automation

## Principi Fondamentali

### 1. Test Focalizzati

Un test deve verificare **una sola cosa**.

```typescript
// ❌ Bad: test verifica più cose
test('profile page works', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();
  await profilePage.editSection('Dati anagrafici');
  expect(await profilePage.isSectionVisible('Dati anagrafici')).toBe(true);
  expect(await profilePage.isFieldDisabled('Nome')).toBe(true);  // Wait, we're in view mode!
  expect(await profilePage.isFieldEnabled('Cognome')).toBe(true);  // Now edit mode?
});

// ✅ Good: test focalizzato su una cosa
test('view mode shows all sections', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();
  expect(await profilePage.isSectionVisible('Dati anagrafici')).toBe(true);
});

test('edit mode enables fields', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();
  await profilePage.editSection('Dati anagrafici');
  expect(await profilePage.isFieldEnabled('Nome')).toBe(true);
});
```

---

### 2. Test Indipendenti

Ogni test deve poter essere eseguito in isolamento.

```typescript
// ❌ Bad: test 2 dipende da test 1
test('create user', async ({ page }) => {
  // ... create user
  userId = 'new-user-id';
});

test('edit user', async ({ page }) => {
  // ... assumes userId exists from previous test
  await page.goto(`/setup/people/${userId}/edit`);
});

// ✅ Good: ogni test è indipendente
test('create user', async ({ page }) => {
  // ... create user and verify
});

test('edit user', async ({ page }) => {
  // ... create new user or use existing test user
  await page.goto(`/setup/people/${existingUserId}/edit`);
});
```

---

### 3. Nomi Descrittivi

Il nome del test deve dire cosa fa.

```typescript
// ❌ Bad: nome generico
test('test1', async ({ page }) => { /* ... */ });
test('profile', async ({ page }) => { /* ... */ });

// ✅ Good: nome descrittivo
test('view mode shows all sections', async ({ page }) => { /* ... */ });
test('edit mode enables auth data fields', async ({ page }) => { /* ... */ });
test('limited user cannot edit fields (permissions check)', async ({ page }) => { /* ... */ });
```

---

### 4. Usare Page Object Model

Non interagire mai direttamente con la UI nei test.

```typescript
// ❌ Bad: interazione diretta con UI
test('edit user name', async ({ page }) => {
  await page.goto('/account/profile');
  await page.getByRole('button', { name: 'Modifica' }).click();
  await page.getByLabel('Nome').fill('Mario');
  await page.getByRole('button', { name: 'Salva' }).click();
});

// ✅ Good: uso POM
test('edit user name', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();
  await profilePage.editSection('Dati anagrafici');
  await profilePage.fillField('Nome', 'Mario');
  await profilePage.saveForm();
});
```

---

### 5. Usare Helpers

Non duplicare codice — usa helpers.

```typescript
// ❌ Bad: codice duplicato
test('login as admin', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'admin@cucu.local');
  await page.fill('input[type="password"]', 'password');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
});

test('login as limited user', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="email"]', 'limited@cucu.local');
  await page.fill('input[type="password"]', 'password');
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/dashboard/);
});

// ✅ Good: usa helper
test('login as admin', async ({ page }) => {
  await login(page, 'admin');
});

test('login as limited user', async ({ page }) => {
  await login(page, 'limited-user');
});
```

---

## Assertions

### Specifiche, Non Vaghe

```typescript
// ❌ Bad: assertion vaga
expect(value).toBeTruthy();
expect(value).not.toBeNull();
expect(value).toBeDefined();

// ✅ Good: assertion specifica
expect(value).toBe(true);
expect(value).toBe('Mario');
expect(value).toBe(123);
expect(array).toHaveLength(5);
```

### One Assert Per Test

```typescript
// ❌ Bad: multipli assert senza separazione
test('profile page view mode', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();
  expect(await profilePage.isSectionVisible('Dati anagrafici')).toBe(true);
  expect(await profilePage.isSectionVisible('Dati personali')).toBe(true);
  expect(await profilePage.isSectionVisible('Ruolo e organizzazione')).toBe(true);
});

// ✅ Good: un assert per test (o logici separati)
test('view mode shows auth data section', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();
  expect(await profilePage.isSectionVisible('Dati anagrafici')).toBe(true);
});

test('view mode shows personal data section', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();
  expect(await profilePage.isSectionVisible('Dati personali')).toBe(true);
});
```

---

## Wait Strategies

### Evita `waitForTimeout`

```typescript
// ❌ Bad: wait non deterministico
await page.waitForTimeout(1000);  // What if page loads in 100ms?
await page.waitForTimeout(5000);  // What if page loads in 10s?

// ✅ Good: use expect with timeout
await expect(profilePage.getByText('Dati anagrafici')).toBeVisible({ timeout: 5000 });

// ✅ Good: use wait helper
await waitForFieldEnabled(page, 'Nome');
```

### Usa `expect` con timeout

```typescript
// ✅ Good: Playwright ha timeout integrato
await expect(profilePage.getByText('Dati anagrafici')).toBeVisible();

// Puoi specificare timeout custom
await expect(profilePage.getByText('Dati anagrafici')).toBeVisible({ timeout: 10000 });
```

---

## Selectors

### Preferisci Accessible Selectors

```typescript
// ❌ Bad: CSS selector non accessibile
await page.locator('.btn-primary').click();
await page.locator('#submit-button').click();

// ✅ Good: accessible selector
await page.getByRole('button', { name: 'Salva' }).click();

// ✅ Good: label-based selector
await page.getByLabel('Nome').fill('Mario');
```

### Evita Fragile Selectors

```typescript
// ❌ Bad: selector fragile
await page.locator('div:nth-child(3) > button').click();  // Se DOM cambia, rompe
await page.locator('.submit-btn').click();  // Se classe cambia, rompe

// ✅ Good: selector robusto
await page.getByRole('button', { name: 'Salva' }).click();
```

---

## Setup/Teardown

### Usa `beforeEach`/`afterEach`

```typescript
test.describe('Profile Page', () => {
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
});
```

### Cleanup dopo test

```typescript
test.afterEach(async ({ page }) => {
  // Logout
  await logout(page);

  // Clear localStorage/sessionStorage se necessario
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
});
```

---

## Test Data

### Usa Test Data Fissi

```typescript
// ✅ Good: test data definito
const TEST_USERS = {
  admin: {
    email: 'admin@cucu.local',
    password: 'password',
  },
  'limited-user': {
    email: 'limited@cucu.local',
    password: 'password',
  },
};

// ✅ Good: usa test data
await login(page, 'admin');

// ❌ Bad: data dinamica
await login(page, `admin-${Date.now()}@cucu.local`);
```

### Cleanup Test Data

```typescript
test.afterEach(async ({ page }) => {
  // Delete created test data
  if (createdUserId) {
    await deleteUser(page, createdUserId);
  }
});
```

---

## Error Handling

### Evita try/catch in test (se possibile)

```typescript
// ❌ Bad: try/catch nasconde errori
test('edit user', async ({ page }) => {
  try {
    await page.goto('/account/profile');
    await page.click('button');
    // ... test code
  } catch (error) {
    console.error('Test failed', error);
  }
  // Se fallisce, test passa comunque! ❌
});

// ✅ Good: lascia Playwright gestire errori
test('edit user', async ({ page }) => {
  await page.goto('/account/profile');
  await page.click('button');
  // Se fallisce, Playwright mostra errore e test fallisce ✅
});
```

### Usa try/catch solo se testato

```typescript
test('error message shows on invalid input', async ({ page }) => {
  const profilePage = new ProfilePage(page);
  await profilePage.goto();

  // Enter invalid data
  await profilePage.fillField('Email', 'invalid-email');

  // Try save
  await profilePage.saveForm();

  // Verify error message shows
  await expect(page.getByText('Email non valida')).toBeVisible();
});
```

---

## Performance

### Esegui test in parallelo (quando possibile)

```typescript
// playwright.config.ts
export default defineConfig({
  fullyParallel: true,  // ✅ Default: run tests in parallel
  // ...
});
```

### Evita test lenti non necessari

```typescript
// ❌ Bad: test lento
test('user can login', async ({ page }) => {
  await login(page, 'admin');
  // ... lots of unnecessary waits
});

// ✅ Good: test veloce
test('user can login', async ({ page }) => {
  await login(page, 'admin');
  await expect(page.getByText('Dashboard')).toBeVisible();
});
```

---

## Maintenance

### Aggiorna POM quando UI cambia

```typescript
// Se UI cambia:
// - Nome del button: 'Modifica' → 'Edit'
// - Aggiorna POM

export class ProfilePage {
  async editSection(section: string) {
    // ❌ Old: 'Modifica'
    // await this.page.getByRole('button', { name: 'Modifica' }).click();

    // ✅ New: 'Edit'
    await this.page.getByRole('button', { name: 'Edit' }).click();
  }
}
```

### Rimuovi test obsoleti

Se una feature viene rimossa, rimuovi anche i test.

```typescript
// ❌ Bad: test obsoleto
test('legacy feature works', async ({ page }) => {
  // Feature rimossa nel codice
});

// ✅ Good: rimuovi test obsoleto
// Cancella il file o commenta con ragione
```

---

## Riferimenti

- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Testing Library Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library-test-cases)
- [Google Testing Best Practices](https://testing.googleblog.com/2015/04/just-say-no-to-more-end-to-end-tests.html)
