import { type FC, useState } from "react";

import { clone, create } from "@bufbuild/protobuf";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import Chip, { ChipSize, ChipVariant } from "@galaxy-io/dls/chips/Chip";
import Flex, { AlignItems, FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { ToastVariant } from "@galaxy-io/dls/toast/Toast";
import { useToast } from "@galaxy-io/dls/toast/useToast";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  type Function as AlchemyFunction,
  CreateFunctionVersionRequestSchema,
  FunctionSpecSchema,
  type FunctionVersion,
} from "@/gen/functions/v1/functions_pb";

import FunctionEnvInputs from "@/pages/functions/components/env/FunctionEnvInputs";
import type { FunctionEnv } from "@/pages/functions/types";
import {
  createFunctionEnv,
  getFunctionEnvHints,
  serializeFunctionEnv,
} from "@/pages/functions/utils";

import { useAlchemySearchUpdate } from "@/module/hooks";
import type { FunctionSearch } from "@/module/schemas";

import { useCreateFunctionVersionMutation } from "@/api/queries/function_versions";

import { getErrorMessage } from "@/utils/errors";
import { formatVersion } from "@/utils/format";

interface FunctionSettingsPageEnvironmentProps {
  alchemyFunction: AlchemyFunction;
  version: FunctionVersion;
}

const FunctionSettingsPageEnvironment: FC<FunctionSettingsPageEnvironmentProps> = ({
  alchemyFunction,
  version,
}) => {
  const { toast } = useToast();
  const updateSearch = useAlchemySearchUpdate<FunctionSearch>();
  const { mutate: createVersion, isPending: isSaving } = useCreateFunctionVersionMutation();

  const createInitialState = (): FunctionEnv => createFunctionEnv(version.spec);
  const [state, setState] = useState<FunctionEnv>(createInitialState);

  const count = state.variables.length + state.stored.length + state.secrets.length;
  const hints = getFunctionEnvHints(state);
  const next = serializeFunctionEnv(state);
  const hasChanges = JSON.stringify(state) !== JSON.stringify(createInitialState());
  const canSave = hasChanges && hints.length === 0;

  const handleSave = () => {
    if (!version.spec) return;
    const spec = clone(FunctionSpecSchema, version.spec);
    spec.env = next.env;
    spec.secrets = next.secrets;
    createVersion(
      create(CreateFunctionVersionRequestSchema, {
        functionId: alchemyFunction.id,
        spec,
        secretValues: next.secretValues,
      }),
      {
        onSuccess: ({ version: built }) => {
          toast({
            header: `${formatVersion(built?.version)} building`,
            variant: ToastVariant.SUCCESS,
          });
          void updateSearch((prev) => ({ ...prev, version: built?.version }), { replace: true });
        },
        onError: (error) => {
          toast({
            header: "Save failed",
            description: getErrorMessage(error, "Failed to save environment"),
            variant: ToastVariant.ERROR,
          });
        },
      },
    );
  };

  return (
    <Widget
      header="Environment"
      isCollapsible
      actions={
        count > 0 && (
          <Chip label={String(count)} variant={ChipVariant.TERTIARY} size={ChipSize.X_SMALL} />
        )
      }
    >
      <Flex direction={FlexDirection.COLUMN} gap={12}>
        <FunctionEnvInputs
          env={state}
          onVariablesChange={(variables) => setState((prev) => ({ ...prev, variables }))}
          onStoredChange={(stored) => setState((prev) => ({ ...prev, stored }))}
          onSecretsChange={(secrets) => setState((prev) => ({ ...prev, secrets }))}
        />
        <Flex justifyContent={JustifyContent.SPACE_BETWEEN} alignItems={AlignItems.CENTER} gap={8}>
          <Text size={TextSize.BODY_SM} variant={TextVariant.ERROR}>
            {hasChanges ? hints[0] : undefined}
          </Text>
          <Flex gap={8}>
            <Button
              label="Cancel"
              variant={ButtonVariant.SECONDARY}
              isDisabled={!hasChanges || isSaving}
              onClick={() => setState(createInitialState())}
            />
            <Button label="Save" isDisabled={!canSave} isLoading={isSaving} onClick={handleSave} />
          </Flex>
        </Flex>
      </Flex>
    </Widget>
  );
};

export default FunctionSettingsPageEnvironment;
