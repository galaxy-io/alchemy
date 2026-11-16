import type { FC } from "react";

import { TrashIcon } from "@phosphor-icons/react";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import Field from "@galaxy-io/dls/inputs/Field";
import KeyValueInput, { type KeyValueInputPair } from "@galaxy-io/dls/inputs/KeyValueInput";
import PasswordInput from "@galaxy-io/dls/inputs/PasswordInput";
import TextInput from "@galaxy-io/dls/inputs/TextInput";
import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Grid from "@galaxy-io/dls/layout/Grid";
import { FontFamily } from "@galaxy-io/dls/theme/enums";

import {
  FUNCTION_ENV_SECRET_DESCRIPTION,
  FUNCTION_ENV_STORED_SECRET_COLUMNS,
  FUNCTION_ENV_STORED_SECRET_PLACEHOLDER,
  FUNCTION_ENV_VARIABLE_DESCRIPTION,
} from "@/pages/functions/constants";
import type { FunctionEnv } from "@/pages/functions/types";

interface FunctionEnvInputsProps {
  env: FunctionEnv;
  onVariablesChange: (variables: KeyValueInputPair[]) => void;
  onStoredChange: (stored: KeyValueInputPair[]) => void;
  onSecretsChange: (secrets: KeyValueInputPair[]) => void;
}

const FunctionEnvInputs: FC<FunctionEnvInputsProps> = ({
  env,
  onVariablesChange,
  onStoredChange,
  onSecretsChange,
}) => (
  <Flex direction={FlexDirection.COLUMN} gap={16}>
    <KeyValueInput
      label="Variables"
      labelTooltip={FUNCTION_ENV_VARIABLE_DESCRIPTION}
      value={env.variables}
      onChange={onVariablesChange}
      fillWidth
    />
    <Field label="Secrets" labelTooltip={FUNCTION_ENV_SECRET_DESCRIPTION} fillWidth>
      <Flex direction={FlexDirection.COLUMN} gap={8}>
        {env.stored.map((pair) => (
          <Grid key={pair.key} columns={FUNCTION_ENV_STORED_SECRET_COLUMNS} gap={8}>
            <TextInput
              ariaLabel="Name"
              value={pair.key}
              family={FontFamily.MONO}
              isReadOnly
              fillWidth
            />
            <PasswordInput
              ariaLabel={`${pair.key} value`}
              placeholder={FUNCTION_ENV_STORED_SECRET_PLACEHOLDER}
              value={pair.value}
              onChange={(value) =>
                onStoredChange(
                  env.stored.map((other) => (other.key === pair.key ? { ...other, value } : other)),
                )
              }
              fillWidth
            />
            <Button
              icon={TrashIcon}
              ariaLabel={`Remove ${pair.key}`}
              variant={ButtonVariant.TERTIARY}
              onClick={() => onStoredChange(env.stored.filter((other) => other.key !== pair.key))}
            />
          </Grid>
        ))}
        <KeyValueInput
          ariaLabel="New secrets"
          value={env.secrets}
          onChange={onSecretsChange}
          fillWidth
        />
      </Flex>
    </Field>
  </Flex>
);

export default FunctionEnvInputs;
