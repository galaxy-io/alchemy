import type { Host, Instance } from "@/gen/functions/v1/host_pb";

export const countInstancesByHost = (instances: Instance[]) => {
  const counts = new Map<Host["hostname"], number>();
  for (const instance of instances) {
    counts.set(instance.host, (counts.get(instance.host) ?? 0) + 1);
  }
  return counts;
};

export const getHostSlotsPercent = (host: Host) =>
  host.slots === 0 ? 0 : (host.slotsInUse / host.slots) * 100;
