# Engineering calculation register

Audit date: 2026-08-20

## Applicability decision

No professional solar/PV, electrical, structural, thermal, financial or resource
engineering calculation engine exists in this repository. Project `totalHours` is
entered metadata, not a computed estimate. Therefore standards-based engineering
formula certification is **NOT APPLICABLE** to the current product. The operational
calculations below still need deterministic behavior and tests. No `ENG-CRITICAL`
through `ENG-LOW` classification is assigned because no professional engineering
result exists; operational defects retain the project P-severity in the findings
register.

| ID | Calculation | Formula, units and assumptions | Verification status | Risk / required evidence |
|---|---|---|---|---|
| CALC-001 | Project code | `max(numeric P- suffix)+1`; dimensionless sequence. `projects/index.ts:49-59` | Logic inspected; concurrency NOT VERIFIED | Race can duplicate; use atomic allocator and parallel-create test |
| CALC-002 | Task code | `count(tasks in project)+1`; dimensionless sequence. `tasks/index.ts:61-70` | FAIL by counterexample | Delete a non-tail task reuses an existing number; replace allocator and test delete/concurrency |
| CALC-003 | Tree depth on move | `relativeDepth=maxDescDepth-currentDepth`; reject if `parentDepth+1+relativeDepth>4`; descendants add `delta` | PARTIALLY VERIFIED statically | Arithmetic is coherent; path wildcard and concurrent move invalidate inputs; property/invariant tests needed |
| CALC-004 | Ordered positions | create `max(position)+1`; reorder `position=i`; ordinal | PARTIALLY VERIFIED | No uniqueness/lock and unscoped stage IDs; full-permutation and concurrency tests needed |
| CALC-005 | File/KB version | `latestVersion+1`; ordinal version | FAIL under concurrency | No unique/lock; DB invariant and simultaneous-upload/update tests required |
| CALC-006 | Dropbox content hash | `SHA256(concat(SHA256(each 4 MiB block)))`; bytes -> 256-bit digest | PASS, unit scope | Existing unit vectors pass; provider round-trip hash evidence still NOT RUN |
| CALC-007 | Dropbox HTTP retry | `min(Retry-After, 2^attempt*2 s)` | FAIL policy review | Can retry earlier than provider requires; honor server minimum and test bounded delays/timeouts |
| CALC-008 | Transfer retry | `min(2^retry*30 s, 600 s)`, max five attempts | Formula PASS; durability FAIL | Timer is process-local and job unclaimed; durable schedule/crash tests needed |
| CALC-009 | Invite/reset lifetime | invite `now+7*24 h`; reset `now+1 h` | PARTIALLY VERIFIED | Duration is clear; atomic consumption/concurrent boundary evidence missing |
| CALC-010 | Journal collapse | collapse adjacent entries with the same actor and `eventType` when absolute timestamp gap is at most five minutes; entity is not compared | FAIL by cross-entity counterexample | Separate entities can be merged; define grouping identity and add boundary/tie tests |
| CALC-011 | Due-day difference | local midnights divided by `86,400,000 ms`, using `round` in chip and `ceil` in task page | FAIL by DST/inconsistency analysis | Milliseconds are not always a local calendar day; model calendar dates/timezones and test DST |
| CALC-012 | Checklist progress | `completed items / all items * 100%`, with zero-item guard | PASS, static | Display-only; add component boundary tests if made contractual |
| CALC-013 | Dropbox usage | `round(used/allocated*100)%`, visual width capped at 100 | PARTIALLY VERIFIED | `allocated=0` is unhandled; define zero/unknown behavior and unit test |
| CALC-014 | Chronicle totals | group task counts, done count and sum file bytes | PARTIALLY VERIFIED | Source scope omits some linked files and archived semantics are unclear; define ledger and test large integers |
| CALC-015 | Byte formatting | binary division by 1024/1,048,576 but labels `KB/MB` | FAIL terminology | Relabel `KiB/MiB` or use decimal units consistently |
| CALC-016 | Transfer batch payload | `20 x configured FILE_MAX_BYTES`; at the 50 MiB default, `~=1 GiB`, excluding copies/overhead | VERIFIED default-scenario estimate, not a global upper bound | Configuration accepts other positive limits; measure heap, stream and cap concurrency |
| CALC-017 | Polling load scenario | For 15 active users with chat/files open, configured intervals imply roughly 195 HTTP requests/min before navigation/actions | ESTIMATE, assumptions explicit | Validate with real journey/load profile; use push/backoff where economics require |

## Traceability details

No row below claims an external engineering standard. “Source” is the implementation
or test location; where the number is an audit estimate, its assumptions are named.

| ID | Module / purpose | Inputs -> output | Units / source |
|---|---|---|---|
| CALC-001 | Projects / display code allocation | existing project codes -> next code string | count; `services/projects/index.ts:49-59` |
| CALC-002 | Tasks / display code allocation | project task rows and project code -> task code | count; `services/tasks/index.ts:61-70` |
| CALC-003 | Projects / enforce tree depth | current/parent/descendant depths -> allowed move and new depths | levels; `services/projects/index.ts:335-414` |
| CALC-004 | Stages/checklists/info blocks / order | existing positions or ordered IDs -> ordinal positions | ordinal; `stages/index.ts:47-58,145-151`; `checklist/index.ts:41-50`; `projectInfoBlocks/index.ts:47-55` |
| CALC-005 | Files/KB / version allocation | latest group/article version -> next integer version | version; `files/index.ts:155-175`; `kb/index.ts:158-173` |
| CALC-006 | File integrity | file bytes -> Dropbox content hash | bytes, 4 MiB blocks, 256-bit hash; `contentHash.ts:5-37` and unit vectors |
| CALC-007 | Dropbox client / retry wait | `Retry-After`, attempt -> delay | seconds/milliseconds; `storage/dropboxAdapter.ts:35-38` |
| CALC-008 | Transfer worker / retry wait | retry number -> next delay/failure | milliseconds; `jobs/transferFiles.ts:16,66-76` |
| CALC-009 | Account workflow / token expiry | issue time -> expiration timestamp | hours/days; `services/admin/users.ts:223`; `services/admin/passwordReset.ts:64-80` |
| CALC-010 | Journal / event grouping | adjacent actor/eventType/timestamps -> collapsed entry; entity is ignored | milliseconds/minutes; `services/journal/index.ts:206-235` |
| CALC-011 | UI / due-day label | due/today timestamps -> signed day count | nominal days; `components/due-date-chip.tsx:15-25`; `pages/tasks.tsx:83-97` |
| CALC-012 | Task UI / checklist progress | completed count, total count -> bar width | ratio/percent; `pages/task-detail.tsx:218-220,382-384` |
| CALC-013 | Admin UI / storage usage | used bytes, allocated bytes -> displayed percent | bytes/percent; `pages/admin-dropbox.tsx:63-67,121` |
| CALC-014 | Chronicle / summary totals | task/file query rows -> counts and byte total | counts/bytes; `services/chronicle/index.ts:75-102,172-175` |
| CALC-015 | UI/report / readable size | bytes -> labeled size string | bytes labelled KB/MB; `components/file-panel.tsx:33-36`; `services/chronicle/index.ts:327-330` |
| CALC-016 | Audit / transfer memory scenario | batch 20, configured file maximum -> payload; default 50 MiB -> ~1 GiB | bytes/MiB/GiB; `lib/env.ts:75-82`; `jobs/transferFiles.ts:93-100` |
| CALC-017 | Audit / polling cost scenario | 15 users and configured intervals -> ~195 requests/min | requests/min; explicit scenario, not measured production load |

## Domains, boundaries, precision and oracles

| ID | Input domain and boundary behavior | Precision / convention | Independent oracle or vectors |
|---|---|---|---|
| CALC-001 | Codes matching `P-[0-9]+`; empty set -> `P-001`; concurrent writers unresolved | PostgreSQL integer cast, zero-padded display | Counterexample/concurrency test NOT RUN |
| CALC-002 | Task count `>=0`; delete-gap and concurrent create fail uniqueness | Integer count and decimal suffix | Delete-gap hand counterexample; concurrency NOT RUN |
| CALC-003 | Integer depths intended `0..4`; missing/invalid paths outside formula | Exact integer arithmetic; dotted materialized path | Property/reference tree test NOT RUN |
| CALC-004 | Finite ordered ID sets; empty/partial/foreign/duplicate sets not rejected consistently | Integer ordinals starting at zero/next max | Full-permutation/concurrency oracle NOT RUN |
| CALC-005 | Existing version `>=1`; empty group -> 1; ties/concurrency unresolved | Exact integer increment | Parallel allocation oracle NOT RUN |
| CALC-006 | Any byte length including zero; 4 MiB block boundary covered | Exact SHA-256 bytes, no rounding | PASS against independent expected hashes at 0, 4 MiB, 4 MiB+1 and 9 MiB |
| CALC-007 | Attempt/retry header numeric; negative/malformed header behavior unspecified | Header seconds converted to integer milliseconds; exponential integer delay | Policy counterexample; timeout/retry vectors NOT RUN |
| CALC-008 | Retry count from zero to five; process restart loses timers | Millisecond integer timer, capped at 600,000 | Formula inspection; durable/crash clock test NOT RUN |
| CALC-009 | Issue timestamps and expiry equality; concurrent use unresolved | Absolute JS/PostgreSQL instants; TTL is duration, not calendar days | Boundary/race clock test NOT RUN |
| CALC-010 | Adjacent events; gap equality at five minutes included; entity not part of key | Millisecond absolute difference | Cross-entity hand counterexample; tie vectors NOT RUN |
| CALC-011 | Valid dates around local midnight/DST; invalid strings not a formula input contract | Local/UTC instants divided by nominal 24 h; mixed round/ceil | DST counterexample; timezone matrix NOT RUN |
| CALC-012 | Total zero explicitly maps to 0%; completed intended `0..total` | JavaScript floating ratio rendered as CSS percent | Static boundary inspection; component vectors NOT RUN |
| CALC-013 | Used/allocated bytes; allocated zero/unknown unhandled | Rounded integer percent; visual width capped at 100 only | Zero-denominator counterexample; component vectors NOT RUN |
| CALC-014 | Query result counts/sums; file/task scope is incomplete; very large sums may exceed safe JS integer | DB numeric values converted/aggregated for display | Independent complete-ledger comparison NOT RUN |
| CALC-015 | Non-negative bytes expected; thresholds at 1,024 and 1,048,576 | Binary divisors with decimal formatting but SI-like labels | Boundary label vectors NOT RUN |
| CALC-016 | Batch limit 20; file maximum is any configured positive value, so no repository-wide finite upper bound | Default scenario in binary MiB/GiB; excludes copies/overhead | Heap/load measurement NOT RUN |
| CALC-017 | Explicit 15-user open-view scenario only; navigation/background-tab behavior excluded | Approximate requests/min from configured intervals | Production/staging request telemetry NOT AVAILABLE |

## Calculation governance gate

Any future solar/PV or other professional engineering module must add named
standards/versions, source equations, unit and coordinate conventions, input
domains, rounding/precision policy, singularity handling, golden vectors,
independent reference implementation or hand calculations, sensitivity checks,
and uncertainty/applicability limits before it may be marketed as engineering
calculation software.
