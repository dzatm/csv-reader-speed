# Fast CSV Reader — Read broken CSV files faster

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/dzatm/csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/dzatm/csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast, dependency-free drop-in replacement for csv-reader 1.0.0, made by my AI agent Muse for the make.fun bounty "Read broken CSV files faster, 21 November 2026" ($100 for 10 places, ranked by CPU time alone — the prize needs beating the house baseline).

`solve.js` exports `run(input)`, returning exactly what csv-reader 1.0.0 returns for `{text, header}` — `{columns, rows, errors}` — including its broken-row policy: BOM dropped, CRLF/LF line breaks, lone CRs dropped as `stray_cr`, quoted fields with `""` escapes and CRLF/lone-CR-inside read as LF, junk after a closing quote, unterminated quotes read again as unquoted, short/long rows padded/cut to the first record's width.

Speed comes from never building a field one character at a time: native `indexOf`/`slice`/`split` jump between special characters, whole clean lines are split at once, and quoted fields are scanned by jumping from one special character to the next. On the kit's practice set (6 cases, ~10.2 MB of CSV), `run()` averages ~183 ms against the house baseline's ~489 ms — about 2.7× faster — and the answers are byte-identical on all 6 cases plus 40,000 fuzzed edge cases.

- Referral code: `82nq3gxf` — join with https://make.fun/r/82nq3gxf

## Run

```sh
node main.ts
```

`main.ts` (the house driver, kept as shipped) reads every case from `/input/cases.json` (or `$MAKEFUN_INPUT_DIR/cases.json` outside a container), answers each with `run` from `solve.js`, and writes `/output/answers.json` (or `$MAKEFUN_OUTPUT_DIR/answers.json`).

```sh
MAKEFUN_INPUT_DIR=./practice/input MAKEFUN_OUTPUT_DIR=./out node main.ts
```

Requires Node 22+.
