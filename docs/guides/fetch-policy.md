# Apollo fetchPolicy Guidelines

Standardized strategy for `fetchPolicy` across the codebase.

## When to use each policy

| Policy | Use case | Examples |
|--------|----------|---------|
| `cache-first` | Lookup data that rarely changes | Roles, seniorities, companies, holiday calendars |
| `cache-and-network` | User-specific data that should show cached first, then refresh | User profile, project details, dashboard stats |
| `network-only` | Security-sensitive or real-time data | Permissions, sessions, auth state |
| `no-cache` | Mutations (default) | All `useMutation` calls |

## Rules

1. **Lookup data** → `cache-first` (roles, seniorities, companies, etc.)
2. **User-facing data** → `cache-and-network` (show something fast, then update)
3. **Security/permissions** → `network-only` (never serve stale auth data)
4. **Sessions/real-time** → `network-only` (always fresh)
5. **Mutations** → `no-cache` (Apollo default, don't override)

## Examples

```tsx
// ✅ Lookup data — cache-first
const { data } = useQuery(GET_SENIORITIES, {
  fetchPolicy: 'cache-first',
});

// ✅ User data — cache-and-network
const { data } = useQuery(GET_USER_PROFILE, {
  fetchPolicy: 'cache-and-network',
});

// ✅ Permissions — network-only
const { data } = useQuery(GET_PERMISSIONS, {
  fetchPolicy: 'network-only',
});
```

## Notes

- Don't use `standby` unless you have a specific reason
- Prefer `cache-and-network` over `network-only` for non-security data
- When adding `optimisticResponse`, the fetchPolicy doesn't change — the cache update is separate
