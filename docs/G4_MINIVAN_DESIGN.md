# G4 — MiniVAN-equivalent (design only; not built)

Mobile canvass client is **later**. G1–G3 are shaped so it can land without redesign.

## Affordances already in G1–G3

| Need | Where |
|------|--------|
| Assign turf to a canvasser | `turfs.assigned_to` + `TurfRepo.assign` / `PATCH /api/dashboard/turfs/[id]` / `?assignedTo=` |
| Ordered offline walk-list | Materialized `turf_addresses` (`sort_order`, `latitude`, `longitude`) |
| Append-only contact trail | `canvass_contacts` INSERT-only; `canvasser_id` + `recorded_at` |
| Offline delta sync hooks | `client_event_id` (idempotent retry), client-supplied `recorded_at`, indexes on `(org, recorded_at, id)` / `(canvasser_id, recorded_at)` |
| Pull contacts since cursor | `GET /api/dashboard/canvass-contacts?sinceId=` / `since=` |
| DNC from the door | `dnc_request` → `contact_suppression` |
| Authoritative geometry | MySQL `ST_Contains` / sphere distance — **not** `geofencing.ts` |

## Guardrails (do not regress)

1. **DB-spatial is authoritative.** `src/lib/geofencing.ts` is draw-preview only. Never export lists from the JS classifier.
2. **Geocoding is async.** Upload queues `geocode_status=pending`; cron/post-import drains. Spatial queries exclude non-`ok`/`provider` rows.
3. **One eligibility query.** Include fences ∩ filters − exclude − DNC − optional already-contacted (`queryTurfAddresses`).
4. **Canvass log is append-only.** Rollup lives in `turf_stop_outcomes`; trail lives in `canvass_contacts`.
5. **SRID 4326 is latitude-first** in MySQL. Covered by `scripts/geospatial/test-axis-order.ts`.

## Explicitly built (MiniVAN M2)

- Scoped walk tokens (`walk_tokens`) — create/revoke from Assignments
- Public `/walk/[token]` PWA (manifest + service worker + IndexedDB queue)
- Sync via `POST /api/public/walk/[token]/sync` with `client_event_id` (idempotent)
- Hard door scope: only `turf_addresses` for that token’s turf

## Still later

- Conflict UI / merge for edits (contacts stay append-only)
- MiniVAN product integration / vendor sync
- Payroll miles/time from GPS

When pulling a walk: `GET /api/public/walk/[token]` caches doors; flush contacts with `client_event_id` + door `recorded_at`.
