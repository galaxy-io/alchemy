import { readFileSync, writeSync } from "node:fs";

const handler = (event: unknown) => event;

const input: unknown = JSON.parse(readFileSync(0, "utf8"));
writeSync(1, JSON.stringify(handler(input)));
