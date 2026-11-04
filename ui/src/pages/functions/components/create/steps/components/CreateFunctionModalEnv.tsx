import type { FC } from "react";

import Chip, { ChipSize, ChipVariant } from "@galaxy-io/dls/chips/Chip";
import KeyValueInput from "@galaxy-io/dls/inputs/KeyValueInput";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import {
  CREATE_FUNCTION_MODAL_SECRET_DESCRIPTION,
  CREATE_FUNCTION_MODAL_SECRETS_KEPT_DESCRIPTION,
  CREATE_FUNCTION_MODAL_VARIABLE_DESCRIPTION,
} from "@/pages/functions/components/create/constants";

const CreateFunctionModalEnv: FC = () => {
  const { variables, secrets, secretNames } = useCreateFunctionModalState();
  const { setVariables, setSecrets } = useCreateFunctionModalActions();
  const count = variables.length + secrets.length;
  const hasKeptSecrets = Object.keys(secretNames).length > 0;

  return (
    <Widget
      header="Environment"
      isCollapsible
      defaultIsOpen={count > 0}
      actions={
        count > 0 && (
          <Chip label={String(count)} variant={ChipVariant.TERTIARY} size={ChipSize.X_SMALL} />
        )
      }
    >
      <Flex direction={FlexDirection.COLUMN} gap={16}>
        <KeyValueInput
          label="Variables"
          labelTooltip={CREATE_FUNCTION_MODAL_VARIABLE_DESCRIPTION}
          value={variables}
          onChange={setVariables}
          fillWidth
        />
        <KeyValueInput
          label="Secrets"
          labelTooltip={CREATE_FUNCTION_MODAL_SECRET_DESCRIPTION}
          description={hasKeptSecrets ? CREATE_FUNCTION_MODAL_SECRETS_KEPT_DESCRIPTION : undefined}
          value={secrets}
          onChange={setSecrets}
          fillWidth
        />
      </Flex>
    </Widget>
  );
};

export default CreateFunctionModalEnv;
