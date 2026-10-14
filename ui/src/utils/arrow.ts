import type { JsonObject, JsonValue } from "@bufbuild/protobuf";
import {
  Binary,
  Bool,
  DataType,
  DateDay,
  DateMillisecond,
  DateUnit,
  Field,
  FixedSizeList,
  Float,
  Int,
  LargeUtf8,
  List,
  makeBuilder,
  makeData,
  Precision,
  RecordBatch,
  type Schema,
  Struct,
  Table,
  Timestamp,
  TimeUnit,
  Type,
  tableFromIPC,
  tableToIPC,
  Utf8,
} from "apache-arrow";

const LIST_ITEM_NAME = "item";
const ARROW_SAMPLE_STRING = "example";
const ARROW_SAMPLE_INT = 1;
const ARROW_SAMPLE_FLOAT = 0.5;

const TIME_UNIT_TO_TOKEN_MAP: Record<TimeUnit, string> = {
  [TimeUnit.SECOND]: "s",
  [TimeUnit.MILLISECOND]: "ms",
  [TimeUnit.MICROSECOND]: "us",
  [TimeUnit.NANOSECOND]: "ns",
};

const TOKEN_TO_TIME_UNIT_MAP: Record<string, TimeUnit> = {
  s: TimeUnit.SECOND,
  ms: TimeUnit.MILLISECOND,
  us: TimeUnit.MICROSECOND,
  ns: TimeUnit.NANOSECOND,
};

const PRECISION_TO_BIT_WIDTH_MAP: Record<Precision, number> = {
  [Precision.HALF]: 16,
  [Precision.SINGLE]: 32,
  [Precision.DOUBLE]: 64,
};

const BIT_WIDTH_TO_PRECISION_MAP: Record<string, Precision> = {
  "16": Precision.HALF,
  "32": Precision.SINGLE,
  "64": Precision.DOUBLE,
};

export const formatArrowType = (type: DataType): string => {
  if (DataType.isUtf8(type)) return "utf8";
  if (DataType.isLargeUtf8(type)) return "large_utf8";
  if (DataType.isBinary(type)) return "binary";
  if (DataType.isBool(type)) return "bool";
  if (DataType.isInt(type)) return `${type.isSigned ? "int" : "uint"}${type.bitWidth}`;
  if (DataType.isFloat(type)) return `float${PRECISION_TO_BIT_WIDTH_MAP[type.precision]}`;
  if (DataType.isDate(type)) return type.unit === DateUnit.DAY ? "date32" : "date64";
  if (DataType.isTimestamp(type)) return `timestamp[${TIME_UNIT_TO_TOKEN_MAP[type.unit]}]`;
  if (DataType.isList(type)) return `list<${formatArrowType(type.valueType)}>`;
  if (DataType.isFixedSizeList(type)) {
    return `fixed_size_list<${formatArrowType(type.valueType)}>[${type.listSize}]`;
  }
  return String(type).toLowerCase();
};

export const parseArrowType = (token: string): DataType | undefined => {
  const list = /^list<(.+)>$/.exec(token);
  if (list?.[1]) {
    const item = parseArrowType(list[1]);
    return item && new List(new Field(LIST_ITEM_NAME, item, true));
  }
  const fixedSizeList = /^fixed_size_list<(.+)>\[(\d+)\]$/.exec(token);
  if (fixedSizeList?.[1] && fixedSizeList[2]) {
    const item = parseArrowType(fixedSizeList[1]);
    return (
      item && new FixedSizeList(Number(fixedSizeList[2]), new Field(LIST_ITEM_NAME, item, true))
    );
  }
  const timestamp = /^timestamp\[(s|ms|us|ns)\]$/.exec(token);
  if (timestamp?.[1]) return new Timestamp(TOKEN_TO_TIME_UNIT_MAP[timestamp[1]]);
  const int = /^(u?)int(8|16|32|64)$/.exec(token);
  if (int?.[2]) return new Int(int[1] === "", Number(int[2]) as 8 | 16 | 32 | 64);
  const float = /^float(16|32|64)$/.exec(token);
  if (float?.[1]) return new Float(BIT_WIDTH_TO_PRECISION_MAP[float[1]]);
  switch (token) {
    case "utf8":
      return new Utf8();
    case "large_utf8":
      return new LargeUtf8();
    case "binary":
      return new Binary();
    case "bool":
      return new Bool();
    case "date32":
      return new DateDay();
    case "date64":
      return new DateMillisecond();
    default:
      return undefined;
  }
};

export const decodeArrowSchema = (bytes: Uint8Array): Schema | undefined => {
  if (bytes.length === 0) return undefined;
  try {
    return tableFromIPC(bytes).schema;
  } catch {
    return undefined;
  }
};

export const encodeArrowSchema = (schema: Schema): Uint8Array =>
  tableToIPC(new Table(schema), "stream");
const coerceArrowValue = (value: JsonValue | undefined, type: DataType): unknown => {
  if (value === null || value === undefined) return value;
  if (DataType.isInt(type) && type.bitWidth === 64 && typeof value !== "object") {
    return BigInt(value as string | number);
  }
  if (DataType.isDate(type) && typeof value !== "object") return new Date(value as string);
  if (DataType.isTimestamp(type) && typeof value === "string") return Date.parse(value);
  return value;
};

export const encodeArrowRows = (schema: Schema, rows: JsonObject[]): Uint8Array => {
  const children = schema.fields.map((field) => {
    const builder = makeBuilder({ type: field.type, nullValues: [null, undefined] });
    for (const row of rows) builder.append(coerceArrowValue(row[field.name], field.type));
    return builder.finish().flush();
  });
  const data = makeData({
    type: new Struct(schema.fields),
    length: rows.length,
    nullCount: 0,
    children,
  });
  return tableToIPC(new Table([new RecordBatch(schema, data)]), "stream");
};

export const decodeArrowRows = (bytes: Uint8Array): JsonValue | undefined => {
  if (bytes.length === 0) return undefined;
  try {
    const rows = tableFromIPC(bytes)
      .toArray()
      .map((row) => row.toJSON());
    return JSON.parse(JSON.stringify(rows)) as JsonValue;
  } catch {
    return undefined;
  }
};

const createArrowSampleValue = (type: DataType): JsonValue => {
  if (DataType.isUtf8(type) || DataType.isLargeUtf8(type)) return ARROW_SAMPLE_STRING;
  if (DataType.isBool(type)) return true;
  if (DataType.isInt(type)) return ARROW_SAMPLE_INT;
  if (DataType.isFloat(type)) return ARROW_SAMPLE_FLOAT;
  if (DataType.isList(type)) return [createArrowSampleValue(type.valueType)];
  if (DataType.isFixedSizeList(type)) {
    return Array.from({ length: type.listSize }, () => createArrowSampleValue(type.valueType));
  }
  return null;
};

export const createArrowSampleRows = (schema: Schema): JsonObject[] => [
  Object.fromEntries(
    schema.fields.map((field) => [
      field.name,
      field.type.typeId === Type.Null ? null : createArrowSampleValue(field.type),
    ]),
  ),
];
