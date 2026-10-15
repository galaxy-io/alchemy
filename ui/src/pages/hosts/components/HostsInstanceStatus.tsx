import type { FC } from "react";

import Beacon from "@galaxy-io/dls/beacons/Beacon";

import type { InstanceStatus } from "@/gen/functions/v1/host_pb";

import {
  HOSTS_INSTANCE_STATUS_TO_LABEL_MAP,
  HOSTS_INSTANCE_STATUS_TO_TONE_MAP,
  HOSTS_LIVE_INSTANCE_STATUSES,
} from "@/pages/hosts/constants";

interface HostsInstanceStatusProps {
  status: InstanceStatus;
}

const HostsInstanceStatus: FC<HostsInstanceStatusProps> = ({ status }) => (
  <Beacon
    label={HOSTS_INSTANCE_STATUS_TO_LABEL_MAP[status]}
    {...HOSTS_INSTANCE_STATUS_TO_TONE_MAP[status]}
    isPulse={HOSTS_LIVE_INSTANCE_STATUSES.has(status)}
  />
);

export default HostsInstanceStatus;
