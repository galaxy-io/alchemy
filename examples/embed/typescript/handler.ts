// embed in TypeScript. See ../README.md for the algorithm.
//
// One Arrow record batch in on stdin, one out on stdout.

import { readFileSync, writeSync } from "node:fs";
import {
  Field,
  FixedSizeList,
  Float64,
  RecordBatch,
  Schema,
  Struct,
  Table,
  Uint32,
  Utf8,
  makeData,
  tableFromIPC,
  tableToIPC,
  vectorFromArray,
} from "apache-arrow";

const DIMENSIONS = 64;
const MODEL = "hash-trigram-64-v1";

const embeddingType = new FixedSizeList(DIMENSIONS, new Field("item", new Float64(), false));
const outputSchema = new Schema([
  new Field("id", new Utf8(), false),
  new Field("cleaned_text", new Utf8(), false),
  new Field("token_count", new Uint32(), false),
  new Field("embedding", embeddingType, false),
  new Field("model", new Utf8(), false),
]);

function isSpace(c: number): boolean {
  return c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d || c === 0x0c || c === 0x0b;
}

function clean(text: string): string {
  const out: number[] = [];
  let pendingSpace = false;
  for (const c of Buffer.from(text, "utf8")) {
    if (isSpace(c)) {
      pendingSpace = true;
    } else if (c < 0x20 || c === 0x7f) {
      // control character: dropped
    } else {
      if (pendingSpace && out.length > 0) {
        out.push(0x20);
      }
      pendingSpace = false;
      out.push(c >= 0x41 && c <= 0x5a ? c + 0x20 : c);
    }
  }
  return Buffer.from(out).toString("utf8");
}

function fnv1a(bytes: Uint8Array): number {
  let h = 2166136261;
  for (const b of bytes) {
    h = Math.imul(h ^ b, 16777619) >>> 0;
  }
  return h;
}

function embed(tokens: string[], into: Float64Array): void {
  for (const token of tokens) {
    const padded = Buffer.from(`<${token}>`, "utf8");
    for (let i = 0; i + 3 <= padded.length; i++) {
      const h = fnv1a(padded.subarray(i, i + 3));
      into[h % DIMENSIONS] += h & 0x80000000 ? -1 : 1;
    }
  }
  let sum = 0;
  for (const x of into) {
    sum += x * x;
  }
  const norm = Math.sqrt(sum);
  if (norm > 0) {
    for (let i = 0; i < into.length; i++) {
      into[i] /= norm;
    }
  }
}

function main(): void {
  let input: Table;
  try {
    input = tableFromIPC(readFileSync(0));
  } catch (err) {
    console.error(`read input: ${err}`);
    process.exit(1);
  }
  const n = input.numRows;
  const ids = input.getChild("id")!.toArray() as string[];
  const texts = input.getChild("text")!.toArray() as (string | null)[];

  const cleaned: string[] = [];
  const counts = new Uint32Array(n);
  const embeddings = new Float64Array(n * DIMENSIONS);
  for (let i = 0; i < n; i++) {
    const c = clean(texts[i] ?? "");
    const tokens = c === "" ? [] : c.split(" ");
    cleaned.push(c);
    counts[i] = tokens.length;
    embed(tokens, embeddings.subarray(i * DIMENSIONS, (i + 1) * DIMENSIONS));
  }

  const embeddingData = makeData({
    type: embeddingType,
    length: n,
    nullCount: 0,
    child: makeData({ type: new Float64(), length: n * DIMENSIONS, nullCount: 0, data: embeddings }),
  });
  const batch = new RecordBatch(
    outputSchema,
    makeData({
      type: new Struct(outputSchema.fields),
      length: n,
      nullCount: 0,
      children: [
        vectorFromArray(ids, new Utf8()).data[0],
        vectorFromArray(cleaned, new Utf8()).data[0],
        makeData({ type: new Uint32(), length: n, nullCount: 0, data: counts }),
        embeddingData,
        vectorFromArray(new Array<string>(n).fill(MODEL), new Utf8()).data[0],
      ],
    }),
  );
  writeSync(1, tableToIPC(new Table(outputSchema, [batch]), "stream"));
}

main();
