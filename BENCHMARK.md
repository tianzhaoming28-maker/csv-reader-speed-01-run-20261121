# Benchmarks — csv-reader-speed-01-run-20261121

Measured 2026-11-21 on this VM (Node v24.22.1) against the kit's practice
set: 6 cases, 10,193,953 input characters (9.72 MiB), 77,506 records.

## Correctness

- Practice set: **6/6 cases identical** to the reference (`practice/reference/expected.json`, canonical JSON comparison).
- Edge cases: 68 hand-built inputs × `{header: true, false}` = **136/136 identical** to csv-reader 1.0.0 (BOM, blank lines, CRLF/LF/lone CR, stray CRs, quoted fields with embedded newlines, doubled quotes, quote junk, unterminated quotes, short/long rows, empty fields, trailing line break missing).
- Random fuzz: **20,000/20,000 identical** (random strings over `a b , " \n \r space 1 é 东` + BOM, lengths 0–59).
- Determinism: two runs on the practice set produce byte-identical `answers.json` (sha256 `bb5b6cc5c523edf0b18a20cd1f577b0d461b3ae021fd3ab2c9b4e4a5f01002ed` both times).

## Speed

Parse-only (median of 5 in-process runs of `run()` over the 6 cases, no JSON I/O):

| | median | throughput |
|---|---|---|
| This entry | 181 ms | 53.6 MB/s |
| csv-reader 1.0.0 (house baseline) | 496 ms | 19.6 MB/s |
| **Speedup** | **2.73×** | |

End to end (`node main.ts`, fresh process, includes JSON parse of `cases.json` and `JSON.stringify` of the 12 MB answers — overhead shared with the baseline):

| | user time (3 runs) |
|---|---|
| This entry | 0.74 s / 0.77 s / 0.85 s |
| House baseline | 1.54 s / 1.58 s / 1.72 s |

The first implementation (per-field `{value, ended, added}` objects, one unbounded `indexOf('\r')` per field) measured only 1.18× parse-only; profiling showed `readUnquoted` dominating because 76.3% of practice records contain a quote and take the slow path. The rewrite inlines the field readers, returns only the end kind (value via a shared slot, no per-field object), and bounds the CR search to the current field segment — that is what took it to 2.73×.
