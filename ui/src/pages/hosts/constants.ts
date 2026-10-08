import type { RoleColor } from "@galaxy-io/dls/theme/tokens/types";

import { InstanceStatus } from "@/gen/functions/v1/host_pb";

export const HOSTS_CARD_MIN_WIDTH = 300;

export const INSTANCE_STATUS_TO_LABEL_MAP: Record<InstanceStatus, string> = {
  [InstanceStatus.UNSPECIFIED]: "Unknown",
  [InstanceStatus.BOOTING]: "Booting",
  [InstanceStatus.READY]: "Ready",
  [InstanceStatus.BUSY]: "Busy",
  [InstanceStatus.RELEASING]: "Releasing",
};

export const INSTANCE_STATUS_TO_HUE_MAP: Record<InstanceStatus, RoleColor | null> = {
  [InstanceStatus.UNSPECIFIED]: null,
  [InstanceStatus.BOOTING]: "yellow",
  [InstanceStatus.READY]: "success",
  [InstanceStatus.BUSY]: "blue",
  [InstanceStatus.RELEASING]: null,
};

export const LIVE_INSTANCE_STATUSES = new Set<InstanceStatus>([
  InstanceStatus.BOOTING,
  InstanceStatus.BUSY,
]);
