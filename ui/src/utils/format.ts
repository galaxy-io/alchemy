import {
  formatBytes as formatDlsBytes,
  formatNumber,
  formatRelativeTime,
} from "@galaxy-io/dls/utils/format";

export const EMPTY_VALUE = "—";

export const formatMicros = (us: number | null | undefined): string => {
  if (us === null || us === undefined || Number.isNaN(us)) return EMPTY_VALUE;
  if (us < 1_000) return `${Math.round(us)}µs`;
  const ms = us / 1_000;
  if (ms < 1_000) return `${ms < 10 ? ms.toFixed(1) : Math.round(ms)}ms`;
  const seconds = ms / 1_000;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 2 : 1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${String(Math.round(seconds % 60)).padStart(2, "0")}s`;
};

export const formatMillis = (ms: number | null | undefined): string =>
  ms === null || ms === undefined ? EMPTY_VALUE : formatMicros(ms * 1_000);

export const formatCount = (value: number | null | undefined, isCompact = false): string =>
  value === null || value === undefined ? EMPTY_VALUE : formatNumber(value, { compact: isCompact });

export const formatBytes = (value: bigint): string =>
  value === 0n ? EMPTY_VALUE : formatDlsBytes(Number(value));

export const formatMib = (mib: number): string =>
  mib >= 1024 ? `${(mib / 1024).toFixed(mib % 1024 === 0 ? 0 : 1)} GiB` : `${mib} MiB`;

export const formatPercent = (ratio: number | null | undefined, precision = 1): string =>
  ratio === null || ratio === undefined ? EMPTY_VALUE : `${(ratio * 100).toFixed(precision)}%`;

export const formatTimeAgo = (unixMillis: bigint): string =>
  unixMillis === 0n ? EMPTY_VALUE : formatRelativeTime(Number(unixMillis));

export const formatTimestamp = (unixMillis: bigint): string =>
  unixMillis === 0n
    ? EMPTY_VALUE
    : new Date(Number(unixMillis)).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
