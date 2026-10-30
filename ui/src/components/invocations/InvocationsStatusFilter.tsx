import type { FC } from "react";

import MultiSelectInput from "@galaxy-io/dls/inputs/MultiSelectInput";
import type { SelectOption } from "@galaxy-io/dls/inputs/SelectInput";
import Box from "@galaxy-io/dls/layout/Box";

import { InvocationStatus } from "@/gen/functions/v1/invocations_pb";

import {
  INVOCATION_STATUS_TO_LABEL_MAP,
  INVOCATION_STATUSES,
  INVOCATIONS_STATUS_FILTER_WIDTH,
} from "@/components/invocations/constants";
import InvocationStatusSwatch from "@/components/invocations/InvocationStatusSwatch";

import { mapOptionIdToEnum } from "@/utils/select";

const INVOCATIONS_STATUS_FILTER_OPTIONS: SelectOption[] = INVOCATION_STATUSES.map((status) => ({
  id: String(status),
  label: INVOCATION_STATUS_TO_LABEL_MAP[status],
  leading: <InvocationStatusSwatch status={status} />,
}));

interface InvocationsStatusFilterProps {
  value: InvocationStatus[];
  onChange: (statuses: InvocationStatus[]) => void;
}

const InvocationsStatusFilter: FC<InvocationsStatusFilterProps> = ({ value, onChange }) => (
  <Box width={INVOCATIONS_STATUS_FILTER_WIDTH}>
    <MultiSelectInput
      ariaLabel="Status"
      placeholder="All statuses"
      options={INVOCATIONS_STATUS_FILTER_OPTIONS}
      value={value.map(String)}
      onChange={(ids) => onChange(ids.map((id) => mapOptionIdToEnum(InvocationStatus, id)))}
      fillWidth
    />
  </Box>
);

export default InvocationsStatusFilter;
