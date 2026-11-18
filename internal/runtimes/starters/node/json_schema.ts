import { readFileSync, writeSync } from "node:fs";

// Log to stderr: stdout is the output, so console.log would corrupt it.
const logger = (...args: unknown[]) => console.error(...args);

const handler = (event: unknown) => event;

const input: unknown = JSON.parse(readFileSync(0, "utf8"));
writeSync(1, JSON.stringify(handler(input)));
