import { readFileSync, writeSync } from "node:fs";

import { type Table, tableFromIPC, tableToIPC } from "apache-arrow";

// Log to stderr: stdout is the output, so console.log would corrupt it.
const logger = (...args: unknown[]) => console.error(...args);

const handler = (table: Table): Table => table;

const output = handler(tableFromIPC(readFileSync(0)));
writeSync(1, tableToIPC(output, "stream"));
