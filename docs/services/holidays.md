# Holidays Service

Holidays owns holiday calendars, company closures, user absences, and business-day calculations.

## Runtime Role

- Owns `HolidayCalendar`, `CompanyClosure`, and `UserAbsence`.
- Exposes GraphQL for calendars, country options, closures, and absences.
- Exposes RPC for capacity/business-day consumers.
- Seeds built-in holiday calendars.

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

## Boundaries

Holidays provides calendar and absence facts. It does not own allocation, milestone dates, or project scheduling. Milestone to Resource and Gantt surfaces consume holidays instead of duplicating calendar rules.
