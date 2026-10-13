import MultiSelectInput from "@galaxy-io/dls/inputs/MultiSelectInput";
import type { SelectOption } from "@galaxy-io/dls/inputs/SelectInput";
import Flex from "@galaxy-io/dls/layout/Flex";

import type { InvocationStatus } from "@/gen/functions/v1/invocations_pb";

import InvocationStatusSwatch from "@/pages/invocations/components/InvocationStatusSwatch";
import {
  INVOCATION_STATUS_TO_LABEL_MAP,
  INVOCATION_STATUSES,
  INVOCATIONS_STATUS_FILTER_WIDTH,
} from "@/pages/invocations/constants";

const INVOCATIONS_STATUS_OPTIONS: SelectOption[] = INVOCATION_STATUSES.map((status) => ({
  id: String(status),
  label: INVOCATION_STATUS_TO_LABEL_MAP[status],
  leading: <InvocationStatusSwatch status={status} />,
}));

interface InvocationsStatusFilterProps {
  value: InvocationStatus[];
  onChange: (statuses: InvocationStatus[]) => void;
}

const InvocationsStatusFilter = ({ value, onChange }: InvocationsStatusFilterProps) => (
  <Flex width={INVOCATIONS_STATUS_FILTER_WIDTH} shrink={0}>
    <MultiSelectInput
      ariaLabel="Status"
      placeholder="All statuses"
      options={INVOCATIONS_STATUS_OPTIONS}
      value={value.map(String)}
      onChange={(ids) => onChange(ids.map((id) => Number(id) as InvocationStatus))}
      isClearable
      fillWidth
    />
  </Flex>
);

export default InvocationsStatusFilter;
