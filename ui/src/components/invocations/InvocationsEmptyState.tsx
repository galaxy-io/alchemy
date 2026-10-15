import type { FC } from "react";

import { ListMagnifyingGlassIcon, MagnifyingGlassIcon } from "@phosphor-icons/react";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import EmptyLayout from "@galaxy-io/dls/layout/EmptyLayout";

interface InvocationsEmptyStateProps {
  hasFilters: boolean;
  onClear: () => void;
}

const InvocationsEmptyState: FC<InvocationsEmptyStateProps> = ({ hasFilters, onClear }) =>
  hasFilters ? (
    <EmptyLayout
      icon={MagnifyingGlassIcon}
      header="No invocations match"
      actions={<Button label="Clear filters" variant={ButtonVariant.SECONDARY} onClick={onClear} />}
    />
  ) : (
    <EmptyLayout icon={ListMagnifyingGlassIcon} header="No invocations in this window" />
  );

export default InvocationsEmptyState;
