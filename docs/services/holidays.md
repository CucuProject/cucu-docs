# Holidays Service

Holidays owns holiday calendars, company closures, user absences, and business-day calculations.

## Runtime Role

- Owns `HolidayCalendar`, `CompanyClosure`, and `UserAbsence`.
- Exposes GraphQL for calendars, country options, closures, and absences.
- Exposes RPC for capacity/business-day consumers.
- Seeds built-in holiday calendars.
- Stores national holiday calendars in a shared database and company closures/user absences in tenant databases.

## GraphQL Surface

- Holiday calendars: `holidayCalendars`, `availableHolidayCountries`, upsert/delete/reseed calendar.
- Company closures: list/detail/create/update/delete.
- User absences: list/detail/create/update/delete.

## RPC and Events

Inbound RPC:

- `GET_HOLIDAYS`
- `GET_HOLIDAYS_BULK`
- `GET_AVAILABLE_COUNTRIES`
- `GET_COMPANY_CLOSURES`
- `GET_USER_ABSENCES`
- `GET_BUSINESS_DAYS`

Inbound events:

- `PERMISSIONS_CHANGED`

## Failure Modes

- National holidays are shared platform data, not tenant-scoped records. Tenant-specific closure/absence data still routes through tenant DB.
- User absence and company closure writes do not validate source User/Company existence in the reviewed service code.
- Recurring company closures are matched by month-day. Cross-year ranges are handled manually and should be tested before relying on unusual fiscal-calendar ranges.
- Consumers such as Milestone to Resource may catch Holidays RPC failures and treat the result as no holidays, so allocation day-off enforcement depends on consumer fail policy too.

## Boundaries

Holidays provides calendar and absence facts. It does not own allocation, milestone dates, or project scheduling. Milestone to Resource and Gantt surfaces consume holidays instead of duplicating calendar rules.
