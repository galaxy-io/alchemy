import type { FC } from "react";

import { create } from "@bufbuild/protobuf";
import { TrashIcon } from "@phosphor-icons/react";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import Flex, { AlignItems, FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import ConfirmDialog from "@galaxy-io/dls/modal/ConfirmDialog";
import Text, { TextSize, TextVariant, TextWeight } from "@galaxy-io/dls/text/Text";
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
    <>
      <Widget>
        <Flex justifyContent={JustifyContent.SPACE_BETWEEN} alignItems={AlignItems.CENTER} gap={12}>
          <Flex alignItems={AlignItems.START} direction={FlexDirection.COLUMN} gap={4}>
            <Text weight={TextWeight.MEDIUM}>Delete function</Text>
            <Text size={TextSize.BODY_SM} variant={TextVariant.SECONDARY}>
              This will permanently delete this function.
            </Text>
          </Flex>
          <Button
            label="Delete"
            icon={TrashIcon}
            variant={ButtonVariant.ERROR}
            onClick={() => handleOpen(alchemyFunction)}
          />
        </Flex>
      </Widget>
      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        onConfirm={handleConfirm}
        header="Delete function?"
        description="This is a destructive action and cannot be undone."
        confirmValue={target?.name}
        label="Delete function"
        isDestructive
      />
    </>
  );
};

export default FunctionSettingsPageDanger;
