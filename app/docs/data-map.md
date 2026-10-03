# Segue data map

Every personal field Segue holds: why, who can read it, and when it is deleted. This is the record to keep current as the product changes. It describes the engineering; it is not legal advice.

**Retention rule:** everything in the "Personal" table is erased automatically `RETENTION_HOURS` (default 24) after the passenger's outbound flight departs, or at once when the passenger deletes their data or withdraws the `tracking` consent. Someone who gives consent but never adds a trip is erased after the same window, counted from their consent. The retention worker (`segue/privacy/main.py`) runs every five minutes.

## Personal data

| Field | Table | Purpose (consent) | Encrypted | Who can read it | Leaves the system? |
|---|---|---|---|---|---|
| Name (optional) | `passenger_pii.name_enc` | Address the passenger; identify them to the authority (`authority_share`) | Yes | The passenger; the authority role, only on a fast-track request | Shown to the airport authority only with `authority_share` consent |
| Phone (optional) | `passenger_pii.phone_enc` | Reserved for SMS or WhatsApp alerts (`notifications`). Not used in this build | Yes | The passenger | No |
| Language | `passenger_pii.language` | Write messages in the passenger's language | No | The passenger; the message consumer | No |
| Seat | `itinerary.seat` | Deplaning order and priority list (`tracking`) | No | The passenger, ops, crew, ground | No |
| The two flights | `itinerary.connection_id` | Score the connection (`tracking`) | No | The passenger, ops, crew, ground, authority | Flight numbers only go to AirLabs, with no passenger data |
| Assistance need (optional) | `assistance_need.type_enc` | Arrange help (`assistance`) | Yes | The passenger, ops, crew, ground. **Never the authority** | No |
| Consents | `consent` | Proof of what was agreed, and when | No | The passenger | No |
| Messages sent | `feed_item` (audience `pax`) | Show the passenger their alerts (`notifications`) | No | The passenger | No |
| Rights requests, grievance text, nominee | `rights_request.detail_enc` | Handle the request | Yes (text) | The passenger; the grievance officer | No |

## Not collected

Passport or visa details, full booking reference (PNR), date of birth, payment data, precise location, a picture of the boarding pass. The boarding pass barcode is read in the browser; only the flight number and seat are sent to the server.

## Kept after erasure, without identifiers

| Data | Why | Form |
|---|---|---|
| `decision` rows | Measure how the engine performs | `principal_id`, `itinerary_id` and the payload are cleared on erasure |
| `connection_risk`, `flight_instance` | Flight-level, not personal | No passenger link |
| `audit_log` | Accountability and breach scoping | Actor is a staff email or a pseudonymous ID; no names |

## Where personal data does not go

- **Events and queues:** Redpanda events and RabbitMQ messages carry pseudonymous IDs, seats and flight numbers. No names. The authority's list is resolved to a name only when an authority user reads it, and that read is logged.
- **The model:** clef-flash runs on your own machine. Its input holds times, counts, a seat and, with consent, the declared assistance need. No name, phone or ID (tested: `tests/test_engine.py::test_model_state_holds_no_identity`).
- **Logs:** services log event types and error classes, not payloads. The model SDK's body logging is turned off.

## DPDP obligations and where they live

| Obligation | Implementation |
|---|---|
| Notice before collection | `GET /notice` (`segue/api/notice.py`), versioned, English and Hindi |
| Free, specific, informed consent | `POST /consent`: one unticked box per purpose; the notice version is stored with each consent |
| Withdrawal as easy as giving | `POST /me/consent/withdraw`, one switch on the Privacy page |
| Purpose limitation | The engine checks consent before each decision type (`segue/engine/core.py`); tested |
| Data minimisation | The "Not collected" list above |
| Accuracy and correction | `PATCH /me/data` |
| Access | `GET /me/data` returns everything held, decrypted |
| Erasure | `DELETE /me`, withdrawal of `tracking`, and the retention worker |
| Grievance redressal | `POST /me/grievance`; contact shown in the notice |
| Nomination | `POST /me/nominee` |
| Security safeguards | Field encryption (Fernet), role-based access on every staff route, signed httpOnly session cookies, audit log |
| Breach notification | `docs/breach-procedure.md` |
| Children | An 18-or-over declaration is required; the service is not offered to children |

## For you to settle (not code)

- Name a grievance officer and replace `GRIEVANCE_CONTACT`.
- Have a lawyer review the notice wording in `segue/api/notice.py`.
- Sign a processing agreement with any party that handles the data for you (hosting, messaging providers).
- Turn on HTTPS and set the session cookie to `secure` before any public use.
- The verified-age and consent-manager provisions of the DPDP Rules are not built: this is an adults-only prototype.
