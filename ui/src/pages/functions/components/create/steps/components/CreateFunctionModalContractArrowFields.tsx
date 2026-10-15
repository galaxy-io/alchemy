import { type FC, useMemo } from "react";

import { PlusIcon, TrashIcon } from "@phosphor-icons/react";

import Button, { ButtonSize, ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import CheckboxInput, { CheckboxInputVariant } from "@galaxy-io/dls/inputs/CheckboxInput";
import { InputVariant } from "@galaxy-io/dls/inputs/Input";
import SelectInput, { SelectInputVariant } from "@galaxy-io/dls/inputs/SelectInput";
import TextInput from "@galaxy-io/dls/inputs/TextInput";
import Box from "@galaxy-io/dls/layout/Box";
import EmptyLayout, { EmptyLayoutSize } from "@galaxy-io/dls/layout/EmptyLayout";
import Flex, { AlignItems, FlexDirection } from "@galaxy-io/dls/layout/Flex";
import FlexItem from "@galaxy-io/dls/layout/FlexItem";
import InfiniteTable from "@galaxy-io/dls/table/InfiniteTable";
import type { TableColumn } from "@galaxy-io/dls/table/types";

import FunctionContractIsland from "@/pages/functions/components/contract/FunctionContractIsland";
import {
  useCreateFunctionModalActions,
  useCreateFunctionModalState,
} from "@/pages/functions/components/create/CreateFunctionModalProvider";
import {
  CREATE_FUNCTION_MODAL_ARROW_TYPE_WIDTH,
  CREATE_FUNCTION_MODAL_ARROW_TYPES,
  CREATE_FUNCTION_MODAL_CONTRACT_SIDE_TO_LABEL_MAP,
  CREATE_FUNCTION_MODAL_DEFAULT_ARROW_TYPE,
} from "@/pages/functions/components/create/constants";
import type { CreateFunctionModalArrowField } from "@/pages/functions/components/create/types";
import { FUNCTION_CONTRACT_KIND_TO_LABEL_MAP } from "@/pages/functions/constants";
import type { FunctionContractSide } from "@/pages/functions/types";

interface CreateFunctionModalContractArrowFieldsProps {
  side: FunctionContractSide;
}

const CreateFunctionModalContractArrowFields: FC<CreateFunctionModalContractArrowFieldsProps> = ({
  side,
}) => {
  const { arrowFields } = useCreateFunctionModalState();
  const { addArrowField, updateArrowField, removeArrowField } = useCreateFunctionModalActions();

  const columns = useMemo<TableColumn<CreateFunctionModalArrowField>[]>(
    () => [
      {
        id: "field",
        header: "Field",
        cell: ({ row }) => (
          <Flex alignItems={AlignItems.CENTER} gap={8} fillWidth>
            <FlexItem grow={1} minWidth={0}>
              <TextInput
                ariaLabel="Field name"
                placeholder="field_name..."
                value={row.name}
                onChange={(name) => updateArrowField(side, row.id, { name })}
                variant={InputVariant.PRIMARY}
                fillWidth
              />
            </FlexItem>
            <FlexItem shrink={0}>
              <Box width={CREATE_FUNCTION_MODAL_ARROW_TYPE_WIDTH}>
                <SelectInput
                  ariaLabel={`${row.name || "Field"} type`}
                  options={[...new Set([...CREATE_FUNCTION_MODAL_ARROW_TYPES, row.type])].map(
                    (type) => ({ id: type, label: type }),
                  )}
                  value={row.type}
                  onChange={(type) =>
                    updateArrowField(side, row.id, {
                      type: type ?? CREATE_FUNCTION_MODAL_DEFAULT_ARROW_TYPE,
                    })
                  }
                  variant={SelectInputVariant.PRIMARY}
                  fillWidth
                />
              </Box>
            </FlexItem>
            <FlexItem shrink={0}>
              <Box padding={[0, 8]}>
                <CheckboxInput
                  label="Nullable"
                  variant={CheckboxInputVariant.PRIMARY}
                  isChecked={row.nullable}
                  onChange={(nullable) => updateArrowField(side, row.id, { nullable })}
                />
              </Box>
            </FlexItem>
            <Button
              icon={TrashIcon}
              ariaLabel={`Remove ${row.name || "field"}`}
              tooltip="Remove field"
              size={ButtonSize.SMALL}
              variant={ButtonVariant.TERTIARY}
              onClick={() => removeArrowField(side, row.id)}
            />
          </Flex>
        ),
      },
    ],
    [side, updateArrowField, removeArrowField],
  );

  return (
    <FunctionContractIsland
      label={CREATE_FUNCTION_MODAL_CONTRACT_SIDE_TO_LABEL_MAP[side]}
      caption={FUNCTION_CONTRACT_KIND_TO_LABEL_MAP.arrow}
      actions={
        <Button
          label="Add field"
          icon={PlusIcon}
          size={ButtonSize.X_SMALL}
          variant={ButtonVariant.TERTIARY}
          onClick={() => addArrowField(side)}
        />
      }
    >
      <Flex direction={FlexDirection.COLUMN} grow={1} basis={0} minHeight={0} fillWidth>
        <InfiniteTable<CreateFunctionModalArrowField>
          ariaLabel={`${CREATE_FUNCTION_MODAL_CONTRACT_SIDE_TO_LABEL_MAP[side]} fields`}
          columns={columns}
          data={arrowFields[side]}
          getRowId={(field) => field.id}
          hasHeader={false}
          emptyState={<EmptyLayout size={EmptyLayoutSize.SMALL} header="No fields" />}
        />
      </Flex>
    </FunctionContractIsland>
  );
};

export default CreateFunctionModalContractArrowFields;
