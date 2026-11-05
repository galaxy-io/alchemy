import { readFileSync, writeSync } from "node:fs";

import { type Table, tableFromIPC, tableToIPC } from "apache-arrow";

const handler = (table: Table): Table => table;

const output = handler(tableFromIPC(readFileSync(0)));
writeSync(1, tableToIPC(output, "stream"));
