import { type Host, type Instance, InstanceStatus } from "@/gen/functions/v1/host_pb";

import { HOSTS_FIRECRACKER_PREFIX } from "@/pages/hosts/constants";

export const getHostsInstances = (host: Host, instances: Instance[]) =>
  instances.filter((instance) => instance.host === host.hostname);

export const getHostsBusyInstances = (instances: Instance[]) =>
  instances
    .filter((instance) => instance.status === InstanceStatus.BUSY)
    .sort((a, b) => Number(a.startedAt - b.startedAt));

export const getHostsKernelName = (kernel: Host["kernel"]) =>
  kernel.slice(kernel.lastIndexOf("/") + 1);

export const getHostsFirecrackerVersion = (version: Host["firecrackerVersion"]) =>
  version.replace(HOSTS_FIRECRACKER_PREFIX, "");
