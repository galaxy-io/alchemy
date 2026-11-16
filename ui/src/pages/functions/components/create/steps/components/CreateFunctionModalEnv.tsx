import type { FC } from "react";

import Chip, { ChipSize, ChipVariant } from "@galaxy-io/dls/chips/Chip";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import FunctionEnvInputs from "@/pages/functions/components/env/FunctionEnvInputs";

const CreateFunctionModalEnv: FC = () => {
  const state = useCreateFunctionModalState();
  const { setVariables, setStoredSecrets, setSecrets } = useCreateFunctionModalActions();
  const count = state.variables.length + state.stored.length + state.secrets.length;

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
      <FunctionEnvInputs
        env={state}
        onVariablesChange={setVariables}
        onStoredChange={setStoredSecrets}
        onSecretsChange={setSecrets}
      />
    </Widget>
  );
};

export default CreateFunctionModalEnv;
