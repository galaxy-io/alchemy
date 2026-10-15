import { EMPTY_VALUE, formatDate, formatNumber } from "@galaxy-io/dls/utils/format";

const MICROS_PER_MILLI = 1_000;
const MILLIS_PER_SECOND = 1_000;
const SECONDS_PER_MINUTE = 60;
const MIB_PER_GIB = 1024;
const PERCENT = 100;

export const formatTimestamp = (unixMillis: bigint) =>
  unixMillis ? formatDate(unixMillis, { style: "dateTime" }) : EMPTY_VALUE;

export const formatVersion = (version: bigint | number | undefined) =>
  version ? `Version ${version}` : EMPTY_VALUE;

export const formatMicros = (micros: bigint | number | null | undefined) => {
  if (micros === null || micros === undefined) return EMPTY_VALUE;
  const us = Number(micros);
  if (Number.isNaN(us)) return EMPTY_VALUE;
  if (us < MICROS_PER_MILLI) return `${Math.round(us)}µs`;
  const ms = us / MICROS_PER_MILLI;
  if (ms < MILLIS_PER_SECOND) return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)}ms`;
  const seconds = ms / MILLIS_PER_SECOND;
  if (seconds < SECONDS_PER_MINUTE) return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
  const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
  return `${minutes}m ${String(Math.round(seconds % SECONDS_PER_MINUTE)).padStart(2, "0")}s`;
};

export const formatMillis = (millis: bigint | number | null | undefined) =>
  millis === null || millis === undefined
    ? EMPTY_VALUE
    : formatMicros(Number(millis) * MICROS_PER_MILLI);

export const formatCount = (value: number | null | undefined) =>
  value === null || value === undefined ? EMPTY_VALUE : formatNumber(value, { precision: 0 });

export const formatRatio = (ratio: number | null | undefined, precision = 1) =>
  ratio === null || ratio === undefined ? EMPTY_VALUE : `${(ratio * PERCENT).toFixed(precision)}%`;

export const formatMemory = (mib: bigint | number) =>
  Number(mib) >= MIB_PER_GIB
    ? `${(Number(mib) / MIB_PER_GIB).toFixed(Number(mib) % MIB_PER_GIB ? 1 : 0)} GiB`
    : `${mib} MiB`;
