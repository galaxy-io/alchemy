import type { JsonObject, JsonValue } from "@bufbuild/protobuf";
import {
  Binary,
  Bool,
  DataType,
  DateDay,
  DateMillisecond,
  DateUnit,
  Decimal,
  Field,
  FixedSizeBinary,
  FixedSizeList,
  Float,
  Int,
  LargeBinary,
  LargeUtf8,
  List,
  makeBuilder,
  makeData,
  Precision,
  RecordBatch,
  type Schema,
  Struct,
  Table,
  Time,
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
const ARROW_SAMPLE_UUID = "00000000-0000-0000-0000-000000000000";
const ARROW_EXTENSION_NAME_KEY = "ARROW:extension:name";
const ARROW_UUID_BYTE_WIDTH = 16;
const ARROW_HEX_RADIX = 16;
const ARROW_UUID_GROUP_ENDS = [4, 6, 8, 10];

enum ArrowExtension {
  JSON = "arrow.json",
  UUID = "arrow.uuid",
}

const ARROW_EXTENSION_TO_TOKEN_MAP: Record<ArrowExtension, string> = {
  [ArrowExtension.JSON]: "json",
  [ArrowExtension.UUID]: "uuid",
};

const ARROW_EXTENSION_TO_STORAGE_MAP: Record<ArrowExtension, () => DataType> = {
  [ArrowExtension.JSON]: () => new Utf8(),
  [ArrowExtension.UUID]: () => new FixedSizeBinary(ARROW_UUID_BYTE_WIDTH),
};

const TOKEN_TO_ARROW_EXTENSION_MAP: Partial<Record<string, ArrowExtension>> = {
  json: ArrowExtension.JSON,
  uuid: ArrowExtension.UUID,
};

const getArrowExtension = (field: Field): ArrowExtension | undefined => {
  const name = field.metadata.get(ARROW_EXTENSION_NAME_KEY);
  return Object.values(ArrowExtension).find((extension) => extension === name);
};

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

export const formatArrowField = (field: Field): string => {
  const extension = getArrowExtension(field);
  return extension ? ARROW_EXTENSION_TO_TOKEN_MAP[extension] : formatArrowType(field.type);
};

export const formatArrowType = (type: DataType): string => {
  if (DataType.isUtf8(type)) return "utf8";
  if (DataType.isLargeUtf8(type)) return "large_utf8";
  if (DataType.isBinary(type)) return "binary";
  if (DataType.isLargeBinary(type)) return "large_binary";
  if (DataType.isFixedSizeBinary(type)) return `fixed_size_binary[${type.byteWidth}]`;
  if (DataType.isBool(type)) return "bool";
  if (DataType.isInt(type)) return `${type.isSigned ? "int" : "uint"}${type.bitWidth}`;
  if (DataType.isFloat(type)) return `float${PRECISION_TO_BIT_WIDTH_MAP[type.precision]}`;
  if (DataType.isDate(type)) return type.unit === DateUnit.DAY ? "date32" : "date64";
  if (DataType.isTimestamp(type)) {
    const unit = TIME_UNIT_TO_TOKEN_MAP[type.unit];
    return type.timezone ? `timestamp[${unit}, tz=${type.timezone}]` : `timestamp[${unit}]`;
  }
  if (DataType.isTime(type)) return `time${type.bitWidth}[${TIME_UNIT_TO_TOKEN_MAP[type.unit]}]`;
  if (DataType.isDecimal(type)) return `decimal${type.bitWidth}(${type.precision}, ${type.scale})`;
  if (DataType.isList(type)) return `list<${formatArrowField(type.children[0])}>`;
  if (DataType.isFixedSizeList(type)) {
    return `fixed_size_list<${formatArrowField(type.children[0])}>[${type.listSize}]`;
  }
  return String(type).toLowerCase();
};

export const parseArrowField = (
  name: string,
  token: string,
  nullable: boolean,
): Field | undefined => {
  const extension = TOKEN_TO_ARROW_EXTENSION_MAP[token];
  if (extension) {
    const metadata = new Map([[ARROW_EXTENSION_NAME_KEY, extension]]);
    return new Field(name, ARROW_EXTENSION_TO_STORAGE_MAP[extension](), nullable, metadata);
  }
  const type = parseArrowType(token);
  return type && new Field(name, type, nullable);
};

export const parseArrowType = (token: string): DataType | undefined => {
  const extension = TOKEN_TO_ARROW_EXTENSION_MAP[token];
  if (extension) return ARROW_EXTENSION_TO_STORAGE_MAP[extension]();
  const list = /^list<(.+)>$/.exec(token);
  if (list?.[1]) {
    const item = parseArrowField(LIST_ITEM_NAME, list[1], true);
    return item && new List(item);
  }
  const fixedSizeList = /^fixed_size_list<(.+)>\[(\d+)\]$/.exec(token);
  if (fixedSizeList?.[1] && fixedSizeList[2]) {
    const item = parseArrowField(LIST_ITEM_NAME, fixedSizeList[1], true);
    return item && new FixedSizeList(Number(fixedSizeList[2]), item);
  }
  const fixedSizeBinary = /^fixed_size_binary\[(\d+)\]$/.exec(token);
  if (fixedSizeBinary?.[1]) return new FixedSizeBinary(Number(fixedSizeBinary[1]));
  const timestamp = /^timestamp\[(s|ms|us|ns)(?:, tz=(.+))?\]$/.exec(token);
  if (timestamp?.[1]) return new Timestamp(TOKEN_TO_TIME_UNIT_MAP[timestamp[1]], timestamp[2]);
  const time = /^time(?:32\[(s|ms)\]|64\[(us|ns)\])$/.exec(token);
  if (time?.[1]) return new Time(TOKEN_TO_TIME_UNIT_MAP[time[1]], 32);
  if (time?.[2]) return new Time(TOKEN_TO_TIME_UNIT_MAP[time[2]], 64);
  const decimal = /^decimal(128|256)\((\d+), ?(-?\d+)\)$/.exec(token);
  if (decimal?.[1] && decimal[2] && decimal[3]) {
    return new Decimal(Number(decimal[3]), Number(decimal[2]), Number(decimal[1]));
  }
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
    case "large_binary":
      return new LargeBinary();
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
const encodeArrowUuid = (value: string) =>
  Uint8Array.from(value.replace(/-/g, "").match(/../g) ?? [], (byte) =>
    Number.parseInt(byte, ARROW_HEX_RADIX),
  );

const decodeArrowUuid = (bytes: Uint8Array) =>
  Array.from(
    bytes,
    (byte, index) =>
      `${ARROW_UUID_GROUP_ENDS.includes(index) ? "-" : ""}${byte.toString(ARROW_HEX_RADIX).padStart(2, "0")}`,
  ).join("");

const coerceArrowValue = (value: JsonValue | undefined, field: Field): unknown => {
  if (value === null || value === undefined) return value;
  const extension = getArrowExtension(field);
  if (extension === ArrowExtension.JSON) return JSON.stringify(value);
  if (extension === ArrowExtension.UUID && typeof value === "string") return encodeArrowUuid(value);
  const { type } = field;
  if ((DataType.isList(type) || DataType.isFixedSizeList(type)) && Array.isArray(value)) {
    return value.map((item) => coerceArrowValue(item, type.children[0]));
  }
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
    for (const row of rows) builder.append(coerceArrowValue(row[field.name], field));
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

const parseArrowJson = (value: string): unknown => {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const decodeArrowValue = (value: unknown, field: Field): unknown => {
  if (value === null || value === undefined) return value;
  const extension = getArrowExtension(field);
  if (extension === ArrowExtension.JSON && typeof value === "string") return parseArrowJson(value);
  if (extension === ArrowExtension.UUID && value instanceof Uint8Array) {
    return decodeArrowUuid(value);
  }
  const { type } = field;
  if (DataType.isList(type) || DataType.isFixedSizeList(type)) {
    return Array.from(value as Iterable<unknown>, (item) =>
      decodeArrowValue(item, type.children[0]),
    );
  }
  return value;
};

export const decodeArrowRows = (bytes: Uint8Array): JsonValue | undefined => {
  if (bytes.length === 0) return undefined;
  try {
    const table = tableFromIPC(bytes);
    const rows = table
      .toArray()
      .map((row) =>
        Object.fromEntries(
          table.schema.fields.map((field) => [
            field.name,
            decodeArrowValue(row[field.name], field),
          ]),
        ),
      );
    return JSON.parse(JSON.stringify(rows)) as JsonValue;
  } catch {
    return undefined;
  }
};

const createArrowSampleValue = (field: Field): JsonValue => {
  const extension = getArrowExtension(field);
  if (extension === ArrowExtension.JSON) return {};
  if (extension === ArrowExtension.UUID) return ARROW_SAMPLE_UUID;
  const { type } = field;
  if (DataType.isUtf8(type) || DataType.isLargeUtf8(type)) return ARROW_SAMPLE_STRING;
  if (DataType.isBool(type)) return true;
  if (DataType.isInt(type)) return ARROW_SAMPLE_INT;
  if (DataType.isFloat(type)) return ARROW_SAMPLE_FLOAT;
  if (DataType.isList(type)) return [createArrowSampleValue(type.children[0])];
  if (DataType.isFixedSizeList(type)) {
    return Array.from({ length: type.listSize }, () => createArrowSampleValue(type.children[0]));
  }
  return null;
};

export const createArrowSampleRows = (schema: Schema): JsonObject[] => [
  Object.fromEntries(
    schema.fields.map((field) => [
      field.name,
      field.type.typeId === Type.Null ? null : createArrowSampleValue(field),
    ]),
  ),
];
