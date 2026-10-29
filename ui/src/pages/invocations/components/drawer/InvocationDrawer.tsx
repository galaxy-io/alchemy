import type { FC } from "react";

import { FlaskIcon, ReceiptIcon } from "@phosphor-icons/react";

import Button, { ButtonSize, ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import Drawer, { DrawerSize } from "@galaxy-io/dls/drawer/Drawer";
import ErrorLayout from "@galaxy-io/dls/layout/ErrorLayout";
import PendingLayout from "@galaxy-io/dls/layout/PendingLayout";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import InvocationLogsSplit from "@/components/invocations/InvocationLogsSplit";
import InvocationOutcome from "@/components/invocations/InvocationOutcome";

import { INVOCATION_DRAWER_STORAGE_KEY } from "@/pages/invocations/components/drawer/constants";
import InvocationDrawerFacts from "@/pages/invocations/components/drawer/InvocationDrawerFacts";
import InvocationDrawerHeader from "@/pages/invocations/components/drawer/InvocationDrawerHeader";

import { useAlchemyNavigate } from "@/module/hooks";
import { AlchemyPath } from "@/module/paths";

import { createGetInvocationInput, useGetInvocationQuery } from "@/api/queries/invocations";

import { IS_DEBUG } from "@/constants";

import { isNotFoundError } from "@/utils/errors";

interface InvocationDrawerProps {
  invocationId?: Invocation["id"];
  isOpen: boolean;
  onClose: () => void;
}

const InvocationDrawer: FC<InvocationDrawerProps> = ({ invocationId, isOpen, onClose }) => {
  const navigate = useAlchemyNavigate();

  const { data, error, isError } = useGetInvocationQuery({
    input: createGetInvocationInput(invocationId ?? ""),
    options: { enabled: !!invocationId, retry: false },
  });
  const invocation = data?.invocation;

  const handleOpenWorkbench = (target: Invocation) => {
    void navigate({
      to: AlchemyPath.FUNCTION_WORKBENCH,
      params: { id: target.functionId },
      search: { version: target.version },
    });
  };

  const renderContent = () => {
    if (isError) {
      const isNotFound = isNotFoundError(error);
      return (
        <ErrorLayout
          icon={ReceiptIcon}
          header={isNotFound ? "Invocation not found" : "Failed to load invocation"}
          description={isNotFound ? "This invocation no longer exists" : undefined}
          detail={IS_DEBUG ? error?.message : undefined}
          actions={<Button label="Close" onClick={onClose} variant={ButtonVariant.SECONDARY} />}
        />
      );
    }

    if (!invocation) {
      return <PendingLayout />;
    }

    return (
      <InvocationLogsSplit
        id="invocation-drawer"
        storageKey={INVOCATION_DRAWER_STORAGE_KEY}
        invocationId={invocation.id}
      >
        <InvocationOutcome invocation={invocation} />
        <InvocationDrawerFacts invocation={invocation} />
      </InvocationLogsSplit>
    );
  };

  return (
    <Drawer
      size={DrawerSize.MEDIUM}
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      hasDividers
      isFlush
      icon={ReceiptIcon}
      header={invocation ? <InvocationDrawerHeader invocationId={invocation.id} /> : "Invocation"}
      actions={
        invocation && (
          <Button
            icon={FlaskIcon}
            ariaLabel="Open in workbench"
            tooltip="Open in workbench"
            variant={ButtonVariant.TERTIARY}
            size={ButtonSize.SMALL}
            onClick={() => handleOpenWorkbench(invocation)}
          />
        )
      }
    >
      {renderContent()}
    </Drawer>
  );
};

export default InvocationDrawer;
