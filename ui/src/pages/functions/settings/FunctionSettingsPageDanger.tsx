import type { FC } from "react";

import { create } from "@bufbuild/protobuf";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import Flex, { AlignItems, FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import ConfirmDialog from "@galaxy-io/dls/modal/ConfirmDialog";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  type Function as AlchemyFunction,
  DeleteFunctionRequestSchema,
} from "@/gen/functions/v1/functions_pb";

import { useAlchemyNavigate } from "@/module/hooks";
import { AlchemyPath } from "@/module/paths";

import { useDeleteFunctionMutation } from "@/api/queries/functions";

import { useConfirm } from "@/hooks/useConfirm";

interface FunctionSettingsPageDangerProps {
  alchemyFunction: AlchemyFunction;
}

const FunctionSettingsPageDanger: FC<FunctionSettingsPageDangerProps> = ({ alchemyFunction }) => {
  const navigate = useAlchemyNavigate();
  const { mutate: deleteFunction } = useDeleteFunctionMutation();

  const { handleOpen, isOpen, target, handleClose, handleConfirm } = useConfirm<AlchemyFunction>({
    entityLabel: "Function",
    onConfirm: (deleted, { onSuccess, onError }) =>
      deleteFunction(create(DeleteFunctionRequestSchema, { id: deleted.id }), {
        onSuccess,
        onError,
      }),
    onConfirmed: () => {
      void navigate({ to: AlchemyPath.FUNCTIONS, replace: true });
    },
  });

  return (
    <Widget header="Danger zone" isCollapsible defaultIsOpen>
      <Flex justifyContent={JustifyContent.SPACE_BETWEEN} alignItems={AlignItems.CENTER} gap={16}>
        <Flex direction={FlexDirection.COLUMN} gap={2}>
          <Text size={TextSize.BODY_SM}>Delete this function</Text>
          <Text size={TextSize.CAPTION} variant={TextVariant.TERTIARY}>
            Every version and invocation record goes with it
          </Text>
        </Flex>
        <Button
          label="Delete function"
          variant={ButtonVariant.ERROR}
          onClick={() => handleOpen(alchemyFunction)}
        />
      </Flex>
      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        onConfirm={handleConfirm}
        header={`Delete ${target?.name ?? alchemyFunction.name}?`}
        description="Type the function's name to confirm. Callers will get NOT_FOUND."
        label="Delete function"
        confirmValue={target?.name}
        isDestructive
      />
    </Widget>
  );
};

export default FunctionSettingsPageDanger;
