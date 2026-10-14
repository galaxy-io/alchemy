import { create } from "@bufbuild/protobuf";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import Alert, { AlertVariant } from "@galaxy-io/dls/feedback/Alert";
import Flex, { AlignItems, FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import ConfirmDialog from "@galaxy-io/dls/modal/ConfirmDialog";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  type Function as AlchemyFunction,
  DeleteFunctionRequestSchema,
  GetFunctionRequestSchema,
} from "@/gen/functions/v1/functions_pb";

import { useDeleteFunctionMutation, useSuspenseGetFunctionQuery } from "@/api/queries/functions";

import { useConfirm } from "@/hooks/useConfirm";

import { useAlchemyNavigate, useFunctionParams } from "@/module/hooks";

const FunctionSettingsPageDanger = () => {
  const navigate = useAlchemyNavigate();
  const { id } = useFunctionParams();

  const { data } = useSuspenseGetFunctionQuery({
    input: create(GetFunctionRequestSchema, { id, includeVersions: true }),
  });
  const fn = data.function;

  const { mutate: deleteFunction } = useDeleteFunctionMutation();

  const { handleOpen, isOpen, target, handleClose, handleConfirm } = useConfirm<AlchemyFunction>({
    entityLabel: "Function",
    entityName: (deleted) => deleted.name,
    messages: { successSubheader: (deleted) => `${deleted.name} is gone.` },
    onConfirm: (deleted, { onSuccess, onError }) =>
      deleteFunction(create(DeleteFunctionRequestSchema, { id: deleted.id }), {
        onSuccess,
        onError,
      }),
    onConfirmed: () => navigate({ to: "./images" }),
  });

  if (!fn) return null;

  return (
    <Widget header="Danger zone" isCollapsible defaultIsOpen>
      <Flex justifyContent={JustifyContent.SPACE_BETWEEN} alignItems={AlignItems.CENTER} gap={16}>
        <Flex direction={FlexDirection.COLUMN} gap={2}>
          <Text size={TextSize.BODY_SM}>Delete this function</Text>
          <Text size={TextSize.CAPTION} variant={TextVariant.TERTIARY}>
            Every version, image and invocation record goes with it.
          </Text>
        </Flex>
        <Button
          label="Delete function"
          variant={ButtonVariant.ERROR}
          onClick={() => handleOpen(fn)}
        />
      </Flex>
      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        onConfirm={handleConfirm}
        header={`Delete ${target?.name ?? fn.name}?`}
        description="Type the function's name to confirm. Callers will get NOT_FOUND."
        label="Delete function"
        isDestructive
        confirmValue={target?.name}
      >
        <Alert variant={AlertVariant.WARNING}>
          Filament pipelines that call this function will start failing on their next event.
        </Alert>
      </ConfirmDialog>
    </Widget>
  );
};

export default FunctionSettingsPageDanger;
