import { create } from "@bufbuild/protobuf";
import { ReceiptIcon } from "@phosphor-icons/react";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import Drawer, { DrawerSize } from "@galaxy-io/dls/drawer/Drawer";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";

import { GetInvocationRequestSchema } from "@/gen/functions/v1/invocations_pb";

import ErrorLayout from "@/layouts/ErrorLayout";
import PendingLayout from "@/layouts/PendingLayout";

import InvocationDrawerActions from "@/pages/invocations/components/drawer/InvocationDrawerActions";
import InvocationDrawerFacts from "@/pages/invocations/components/drawer/InvocationDrawerFacts";
import InvocationDrawerHeader from "@/pages/invocations/components/drawer/InvocationDrawerHeader";
import InvocationDrawerLogs from "@/pages/invocations/components/drawer/InvocationDrawerLogs";
import InvocationDrawerOutcome from "@/pages/invocations/components/drawer/InvocationDrawerOutcome";

import { useGetInvocationQuery } from "@/api/queries/invocations";

interface InvocationDrawerProps {
  invocationId?: string;
  isOpen: boolean;
  onClose: () => void;
}

const InvocationDrawer = ({ invocationId, isOpen, onClose }: InvocationDrawerProps) => {
  const { data, isError } = useGetInvocationQuery({
    input: create(GetInvocationRequestSchema, { id: invocationId ?? "" }),
    options: { enabled: !!invocationId },
  });
  const invocation = data?.invocation;

  const renderContent = () => {
    if (isError) {
      return (
        <ErrorLayout
          icon={ReceiptIcon}
          header="Invocation not found"
          description="This invocation no longer exists."
          actions={<Button label="Close" onClick={onClose} variant={ButtonVariant.SECONDARY} />}
        />
      );
    }

    if (!invocation) {
      return <PendingLayout />;
    }

    return (
      <Flex direction={FlexDirection.COLUMN} gap={16}>
        <InvocationDrawerOutcome invocation={invocation} />
        <InvocationDrawerFacts invocation={invocation} />
        <InvocationDrawerLogs logTail={invocation.logTail} />
      </Flex>
    );
  };

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size={DrawerSize.MEDIUM}
      header={invocation ? <InvocationDrawerHeader invocationId={invocation.id} /> : "Invocation"}
      icon={ReceiptIcon}
      actions={invocation && <InvocationDrawerActions invocation={invocation} onClose={onClose} />}
    >
      {renderContent()}
    </Drawer>
  );
};

export default InvocationDrawer;
