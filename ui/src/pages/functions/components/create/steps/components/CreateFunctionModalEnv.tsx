import { type FC, useState } from "react";

import { BracketsCurlyIcon, EyeSlashIcon, PlusIcon, XIcon } from "@phosphor-icons/react";

import Button, { ButtonSize, ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import Chip, { ChipSize, ChipVariant } from "@galaxy-io/dls/chips/Chip";
import { InputSize } from "@galaxy-io/dls/inputs/Input";
import PasswordInput from "@galaxy-io/dls/inputs/PasswordInput";
import TextInput from "@galaxy-io/dls/inputs/TextInput";
import Flex, { AlignItems, FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Grid, { GridAlignItems } from "@galaxy-io/dls/layout/Grid";
import Menu, { MenuItem } from "@galaxy-io/dls/menu/Menu";
import { FontFamily } from "@galaxy-io/dls/theme/enums";
import Widget from "@galaxy-io/dls/widget/Widget";

import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import {
  CREATE_FUNCTION_MODAL_ENV_COLUMNS,
  CREATE_FUNCTION_MODAL_ENV_KEPT_PLACEHOLDER,
  CREATE_FUNCTION_MODAL_SECRET_DESCRIPTION,
  CREATE_FUNCTION_MODAL_VARIABLE_DESCRIPTION,
} from "@/pages/functions/components/create/constants";
import type { CreateFunctionModalEnvEntry } from "@/pages/functions/components/create/types";
import { createCreateFunctionModalEnvEntry } from "@/pages/functions/components/create/utils";

const CreateFunctionModalEnv: FC = () => {
  const { env, secretNames } = useCreateFunctionModalState();
  const { setEnv } = useCreateFunctionModalActions();
  const [isOpen, setIsOpen] = useState(env.length > 0);
  const isExpanded = isOpen && env.length > 0;

  const update = (index: number, patch: Partial<CreateFunctionModalEnvEntry>) =>
    setEnv(env.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));
  const remove = (index: number) => setEnv(env.filter((_, i) => i !== index));
  const add = (isSecret: boolean) => () => {
    setEnv([...env, createCreateFunctionModalEnvEntry({ isSecret })]);
    setIsOpen(true);
  };

  return (
    <Widget
      header="Environment"
      isCollapsible
      hasCaret={env.length > 0}
      isOpen={isExpanded}
      onOpenChange={setIsOpen}
      actions={
        <Flex gap={8} alignItems={AlignItems.CENTER}>
          {env.length > 0 && (
            <Chip
              label={String(env.length)}
              variant={ChipVariant.TERTIARY}
              size={ChipSize.X_SMALL}
            />
          )}
          <Menu
            ariaLabel="Add to the environment"
            trigger={
              <Button
                variant={ButtonVariant.TERTIARY}
                size={ButtonSize.SMALL}
                icon={PlusIcon}
                label="Add"
              />
            }
          >
            <MenuItem
              label="Variable"
              description={CREATE_FUNCTION_MODAL_VARIABLE_DESCRIPTION}
              icon={BracketsCurlyIcon}
              onSelect={add(false)}
            />
            <MenuItem
              label="Secret"
              description={CREATE_FUNCTION_MODAL_SECRET_DESCRIPTION}
              icon={EyeSlashIcon}
              onSelect={add(true)}
            />
          </Menu>
        </Flex>
      }
    >
      <Flex direction={FlexDirection.COLUMN} gap={8}>
        {env.map((entry, index) => {
          const isKept = entry.isSecret && !!secretNames[entry.key.trim()];
          return (
            <Grid
              key={entry.id}
              columns={CREATE_FUNCTION_MODAL_ENV_COLUMNS}
              gap={8}
              alignItems={GridAlignItems.CENTER}
            >
              <TextInput
                ariaLabel="Name"
                placeholder="NAME"
                value={entry.key}
                onChange={(key) => update(index, { key })}
                family={FontFamily.MONO}
                size={InputSize.SMALL}
                fillWidth
              />
              {entry.isSecret ? (
                <PasswordInput
                  ariaLabel="Value"
                  placeholder={isKept ? CREATE_FUNCTION_MODAL_ENV_KEPT_PLACEHOLDER : "value"}
                  value={entry.value}
                  onChange={(value) => update(index, { value })}
                  family={FontFamily.MONO}
                  size={InputSize.SMALL}
                  autoComplete="new-password"
                  fillWidth
                />
              ) : (
                <TextInput
                  ariaLabel="Value"
                  placeholder="value"
                  value={entry.value}
                  onChange={(value) => update(index, { value })}
                  family={FontFamily.MONO}
                  size={InputSize.SMALL}
                  fillWidth
                />
              )}
              <Button
                variant={ButtonVariant.TERTIARY}
                size={ButtonSize.SMALL}
                icon={XIcon}
                ariaLabel="Remove"
                onClick={() => remove(index)}
              />
            </Grid>
          );
        })}
      </Flex>
    </Widget>
  );
};

export default CreateFunctionModalEnv;
