# Personal data breach procedure

A breach is any unauthorised access to, or loss, disclosure or alteration of, personal data Segue holds. The DPDP Act requires telling the Data Protection Board of India and each affected person. This is the working procedure; confirm the current deadlines and forms with a lawyer.

## 1. Contain (first hour)

1. Take the affected service offline or block the route: `docker compose stop api`.
2. Rotate the secrets in `.env`: `JWT_SIGNING_SECRET` (ends all sessions), `SEED_STAFF_PASSWORD` and the staff passwords, the database and RabbitMQ passwords. If the encryption key `PII_KEY` may be exposed, treat all encrypted fields as disclosed.
3. Keep the evidence. Do not delete logs or the database volume.

## 2. Scope

1. Open the control panel's audit log (`GET /admin/audit`). It records every staff read of personal or assistance data, with who and when.
2. List the affected people: which principals had data in the system during the window. Because data is erased 24 hours after each trip, the set is small and recent.
3. For each person, note which fields were exposed, using `docs/data-map.md`.

## 3. Notify

| Who | What | When |
|---|---|---|
| Data Protection Board of India | Nature and extent of the breach, when it happened, likely impact, steps taken | Without delay, with the detailed report inside the period the Rules set (72 hours at the time of writing) |
| Each affected person | What happened, which of their data, what they should do, who to contact | Without delay, in plain language, through the app and any contact they gave |
| The airline (the buyer) | The same facts | At once |

## 4. Fix and record

1. Find and fix the cause. Add a test that would have caught it.
2. Write a short incident record: timeline, cause, people affected, notices sent, changes made.
3. Review whether less data could be held, or held for a shorter time.

## Contacts to fill in

- Grievance officer:
- Legal counsel:
- Airline contact:
