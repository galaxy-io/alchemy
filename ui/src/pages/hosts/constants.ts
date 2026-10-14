import { BeaconVariant } from "@galaxy-io/dls/beacons/Beacon";
import type { RoleColor } from "@galaxy-io/dls/theme/tokens/types";

import { InstanceStatus } from "@/gen/functions/v1/host_pb";

export const HOSTS_CARD_WIDTH = 520;
export const HOSTS_SECTION_HEADER_HEIGHT = 40;
export const HOSTS_CARD_STATS_COLUMNS = "repeat(4, minmax(0, 1fr))";
export const HOSTS_SLOT_HEIGHT = 20;
export const HOSTS_FIRECRACKER_PREFIX = /^firecracker\s+/i;

export const HOSTS_INSTANCE_STATUS_TO_LABEL_MAP: Record<InstanceStatus, string> = {
  [InstanceStatus.UNSPECIFIED]: "Unknown",
  [InstanceStatus.BOOTING]: "Booting",
  [InstanceStatus.READY]: "Ready",
  [InstanceStatus.BUSY]: "Busy",
  [InstanceStatus.RELEASING]: "Releasing",
};

export const HOSTS_INSTANCE_STATUS_TO_TONE_MAP: Record<
  InstanceStatus,
  { color: RoleColor } | { variant: BeaconVariant }
> = {
  [InstanceStatus.UNSPECIFIED]: { variant: BeaconVariant.TERTIARY },
  [InstanceStatus.BOOTING]: { color: "yellow" },
  [InstanceStatus.READY]: { color: "success" },
  [InstanceStatus.BUSY]: { color: "blue" },
  [InstanceStatus.RELEASING]: { variant: BeaconVariant.TERTIARY },
};

export const HOSTS_LIVE_INSTANCE_STATUSES = new Set<InstanceStatus>([
  InstanceStatus.BOOTING,
  InstanceStatus.BUSY,
]);
