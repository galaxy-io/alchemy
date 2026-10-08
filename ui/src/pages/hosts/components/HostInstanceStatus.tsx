import Beacon, { BeaconVariant } from "@galaxy-io/dls/beacons/Beacon";

import type { InstanceStatus } from "@/gen/functions/v1/host_pb";

import {
  INSTANCE_STATUS_TO_HUE_MAP,
  INSTANCE_STATUS_TO_LABEL_MAP,
  LIVE_INSTANCE_STATUSES,
} from "@/pages/hosts/constants";

interface HostInstanceStatusProps {
  status: InstanceStatus;
}

const HostInstanceStatus = ({ status }: HostInstanceStatusProps) => {
  const hue = INSTANCE_STATUS_TO_HUE_MAP[status];
  return (
    <Beacon
      label={INSTANCE_STATUS_TO_LABEL_MAP[status]}
      {...(hue === null ? { variant: BeaconVariant.TERTIARY } : { color: hue })}
      isPulse={LIVE_INSTANCE_STATUSES.has(status)}
    />
  );
};

export default HostInstanceStatus;
