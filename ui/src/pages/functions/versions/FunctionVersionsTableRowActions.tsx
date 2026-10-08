import { CodeIcon } from "@phosphor-icons/react";

import { MenuItem } from "@galaxy-io/dls/menu/Menu";

import type { FunctionVersionsTableRow } from "@/pages/functions/versions/types";

interface FunctionVersionsTableRowActionsProps {
  row: FunctionVersionsTableRow;
  onOpenInWorkbench: (row: FunctionVersionsTableRow) => void;
}

const FunctionVersionsTableRowActions = ({
  row,
  onOpenInWorkbench,
}: FunctionVersionsTableRowActionsProps) => (
  <MenuItem label="Open in workbench" icon={CodeIcon} onSelect={() => onOpenInWorkbench(row)} />
);

export default FunctionVersionsTableRowActions;
