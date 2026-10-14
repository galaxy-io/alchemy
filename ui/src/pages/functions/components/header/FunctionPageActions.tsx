import { create } from "@bufbuild/protobuf";
import { DotsThreeIcon, PlayIcon, PlusIcon, TrashIcon } from "@phosphor-icons/react";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import Menu, { MenuItem, MenuItemVariant, MenuSeparator } from "@galaxy-io/dls/menu/Menu";
import ConfirmDialog from "@galaxy-io/dls/modal/ConfirmDialog";

import {
  type Function as AlchemyFunction,
  DeleteFunctionRequestSchema,
  GetFunctionRequestSchema,
} from "@/gen/functions/v1/functions_pb";

import { getFunctionCurrentVersion } from "@/pages/functions/utils";

import { useDeleteFunctionMutation, useSuspenseGetFunctionQuery } from "@/api/queries/functions";

import { useConfirm } from "@/hooks/useConfirm";

import { useAlchemyNavigate, useAlchemySearchUpdate, useFunctionParams } from "@/module/hooks";
import type { AlchemyLayoutSearch } from "@/module/schemas";
import { Flow } from "@/module/types";

const FunctionPageActions = () => {
  const updateSearch = useAlchemySearchUpdate<AlchemyLayoutSearch>();
  const navigateAlchemy = useAlchemyNavigate();
  const { id } = useFunctionParams();

  const { data } = useSuspenseGetFunctionQuery({
    input: create(GetFunctionRequestSchema, { id, includeVersions: true }),
  });
  const fn = data.function;

  const { mutate: deleteFunction } = useDeleteFunctionMutation();

  const { handleOpen, isOpen, target, handleClose, handleConfirm } = useConfirm<AlchemyFunction>({
    entityLabel: "Function",
    entityName: (deleted) => deleted.name,
    onConfirm: (deleted, { onSuccess, onError }) =>
      deleteFunction(create(DeleteFunctionRequestSchema, { id: deleted.id }), {
        onSuccess,
        onError,
      }),
    onConfirmed: () => navigateAlchemy({ to: "./images" }),
  });

  if (!fn) return null;

  const handleNewVersion = () => {
    void updateSearch((prev) => ({
      ...prev,
      flow: Flow.CREATE_FUNCTION_VERSION,
      functionId: fn.id,
    }));
  };

  const handleInvoke = () => {
    void navigateAlchemy({ to: "./images/$id/workbench", params: { id: fn.id } });
  };

  const handleCopyId = () => {
    void navigator.clipboard.writeText(fn.id);
  };

  return (
    <>
      <Button
        label="New version"
        icon={PlusIcon}
        variant={ButtonVariant.SECONDARY}
        onClick={handleNewVersion}
      />
      <Button
        label="Invoke"
        icon={PlayIcon}
        isDisabled={getFunctionCurrentVersion(fn) === undefined}
        onClick={handleInvoke}
      />
      <Menu
        trigger={
          <Button
            icon={DotsThreeIcon}
            ariaLabel="More"
            tooltip="More"
            variant={ButtonVariant.TERTIARY}
          />
        }
      >
        <MenuItem label="Copy id" onSelect={handleCopyId} />
        <MenuSeparator />
        <MenuItem
          label="Delete function"
          icon={TrashIcon}
          variant={MenuItemVariant.ERROR}
          onSelect={() => handleOpen(fn)}
        />
      </Menu>
      <ConfirmDialog
        isOpen={isOpen}
        onOpenChange={(open) => {
          if (!open) handleClose();
        }}
        onConfirm={handleConfirm}
        header={`Delete ${target?.name ?? fn.name}?`}
        description="Every version and its invocation history goes with it. This cannot be undone."
        label="Delete function"
        isDestructive
        confirmValue={target?.name}
      />
    </>
  );
};

export default FunctionPageActions;
