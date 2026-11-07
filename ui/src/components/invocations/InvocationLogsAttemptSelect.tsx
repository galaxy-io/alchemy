import type { FC } from "react";

import SelectInput, { SelectInputSize, type SelectOption } from "@galaxy-io/dls/inputs/SelectInput";
import Box from "@galaxy-io/dls/layout/Box";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import { INVOCATION_LOGS_ATTEMPT_SELECT_WIDTH } from "@/components/invocations/constants";

interface InvocationLogsAttemptSelectProps {
  attempts: Invocation["attempts"];
  value: Invocation["attempts"];
  onChange: (attempt: Invocation["attempts"]) => void;
}

const InvocationLogsAttemptSelect: FC<InvocationLogsAttemptSelectProps> = ({
  attempts,
  value,
  onChange,
}) => {
  const options: SelectOption[] = Array.from({ length: attempts }, (_, index) => ({
    id: String(index + 1),
    label: `Attempt ${index + 1}`,
  }));

  return (
    <Box width={INVOCATION_LOGS_ATTEMPT_SELECT_WIDTH}>
      <SelectInput
        fillWidth
        size={SelectInputSize.X_SMALL}
        options={options}
        value={String(value)}
        onChange={(attempt) => {
          if (attempt !== null) onChange(Number(attempt));
        }}
        ariaLabel="Attempt"
      />
    </Box>
  );
};

export default InvocationLogsAttemptSelect;
