import type { FC } from "react";

import { ArrowClockwiseIcon, FileCodeIcon, FlaskIcon } from "@phosphor-icons/react";

import { MenuItem } from "@galaxy-io/dls/menu/Menu";

import { FunctionVersionStatus } from "@/gen/functions/v1/functions_pb";

import type { FunctionVersionsTableRow } from "@/pages/functions/versions/types";

interface FunctionVersionsTableRowActionsProps {
  row: FunctionVersionsTableRow;
  onOpenWorkbench: (row: FunctionVersionsTableRow) => void;
  onOpenContract: (row: FunctionVersionsTableRow) => void;
  onRetryBuild: (row: FunctionVersionsTableRow) => void;
}

const FunctionVersionsTableRowActions: FC<FunctionVersionsTableRowActionsProps> = ({
  row,
  onOpenWorkbench,
  onOpenContract,
  onRetryBuild,
}) => (
  <>
    <MenuItem
      label="Open in workbench"
      icon={FlaskIcon}
      isDisabled={row.version.status !== FunctionVersionStatus.READY}
      onSelect={() => onOpenWorkbench(row)}
    />
    <MenuItem label="View contract" icon={FileCodeIcon} onSelect={() => onOpenContract(row)} />
    {row.version.status === FunctionVersionStatus.FAILED && (
      <MenuItem label="Retry build" icon={ArrowClockwiseIcon} onSelect={() => onRetryBuild(row)} />
    )}
  </>
);

export default FunctionVersionsTableRowActions;
