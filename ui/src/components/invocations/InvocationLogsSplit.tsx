import type { FC, PropsWithChildren } from "react";

import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import ResizablePanels, { ResizablePanel } from "@galaxy-io/dls/layout/ResizablePanels";
import ScrollArea from "@galaxy-io/dls/layout/ScrollArea";
import { Orientation } from "@galaxy-io/dls/theme/enums";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import {
  INVOCATION_LOGS_INSET,
  INVOCATION_LOGS_SPLIT_LOGS_DEFAULT_HEIGHT,
  INVOCATION_LOGS_SPLIT_LOGS_MIN_HEIGHT,
} from "@/components/invocations/constants";
import InvocationLogs from "@/components/invocations/InvocationLogs";

interface InvocationLogsSplitProps {
  id: string;
  storageKey: string;
  invocationId: Invocation["id"];
  attempts?: Invocation["attempts"];
  attempt?: Invocation["attempts"];
  onAttemptChange?: (attempt: Invocation["attempts"]) => void;
}

const InvocationLogsSplit: FC<PropsWithChildren<InvocationLogsSplitProps>> = ({
  id,
  storageKey,
  invocationId,
  attempts,
  attempt,
  onAttemptChange,
  children,
}) => (
  <ResizablePanels orientation={Orientation.VERTICAL} storageKey={storageKey} hasDividers>
    <ResizablePanel id={`${id}-details`}>
      <ScrollArea>
        <Flex direction={FlexDirection.COLUMN} gap={16} padding={INVOCATION_LOGS_INSET}>
          {children}
        </Flex>
      </ScrollArea>
    </ResizablePanel>
    <ResizablePanel
      id={`${id}-logs`}
      defaultValue={INVOCATION_LOGS_SPLIT_LOGS_DEFAULT_HEIGHT}
      min={INVOCATION_LOGS_SPLIT_LOGS_MIN_HEIGHT}
      ariaLabel="Logs"
    >
      <InvocationLogs
        invocationId={invocationId}
        attempts={attempts}
        attempt={attempt}
        onAttemptChange={onAttemptChange}
      />
    </ResizablePanel>
  </ResizablePanels>
);

export default InvocationLogsSplit;
