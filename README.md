# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/tianzhaoming28-maker/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/tianzhaoming28-maker/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's own csv-reader 1.0.0: `solve.js` answers every case exactly as csv-reader does — same `{columns, rows, errors}`, same broken-row policy (BOM drop, stray CRs, CRLF and lone CRs inside quotes read as LF, doubled quotes, quote junk, unterminated quotes re-read as unquoted, short/long row padding and cutting) — at about 2.7× the parse speed of the reference on the practice set (53.6 MB/s vs 19.6 MB/s; see `BENCHMARK.md`). No dependencies, no WebAssembly, no native code: plain Node 22 JavaScript.

How it gets faster: the reference walks the text one character at a time and builds every field with `+=`. This reader dispatches per record — a fast path (one slice + `split(',')`) for records whose first line holds no quote and no lone CR, and an `indexOf`-driven re-implementation of the reference's exact state machine for records that do, slicing whole runs between specials and allocating nothing per field beyond the field string itself.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

`main.ts` reads every case from `/input/cases.json` (or `$MAKEFUN_INPUT_DIR`), answers each one alone with `run()` from `solve.js`, and writes `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR`). It turns V8's incremental marking off before importing `solve.js`, as the house baseline's driver does.

---

<sub>Entered on [make.fun](https://make.fun/?ref=qn2pqd71&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
