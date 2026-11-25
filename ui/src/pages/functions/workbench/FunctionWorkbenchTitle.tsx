import type { FC } from "react";

import { LockIcon } from "@phosphor-icons/react";

import Icon, { IconVariant, IconWeight } from "@galaxy-io/dls/icons/Icon";
import Flex, { AlignItems } from "@galaxy-io/dls/layout/Flex";
import Tabs, { type TabItem, TabsSize, TabsVariant } from "@galaxy-io/dls/navigation/Tabs";

import FunctionSourceFileIcon from "@/pages/functions/components/FunctionSourceFileIcon";
import { FUNCTION_WORKBENCH_READ_ONLY_LABEL } from "@/pages/functions/workbench/constants";
import { isFunctionWorkbenchReadOnlyFile } from "@/pages/functions/workbench/utils";

import { useListRuntimesQuery } from "@/api/queries/runtimes";

interface FunctionWorkbenchTitleProps {
  file: string;
  path: string;
}

const FunctionWorkbenchTitle: FC<FunctionWorkbenchTitleProps> = ({ file, path }) => {
  const { data } = useListRuntimesQuery();
  const readOnly = isFunctionWorkbenchReadOnlyFile(file);
  const items: TabItem[] = [
    {
      id: file,
      label: path,
      leading: readOnly ? (
        <Icon
          component={LockIcon}
          size={16}
          weight={IconWeight.FILL}
          variant={IconVariant.TERTIARY}
          ariaLabel={FUNCTION_WORKBENCH_READ_ONLY_LABEL}
        />
      ) : (
        <FunctionSourceFileIcon path={path} runtimes={data?.runtimes ?? []} />
      ),
    },
  ];

  return (
    <Flex alignItems={AlignItems.CENTER} gap={8} minWidth={0}>
      <Tabs
        ariaLabel="File"
        items={items}
        value={file}
        variant={TabsVariant.PILL}
        size={TabsSize.SMALL}
      />
    </Flex>
  );
};

export default FunctionWorkbenchTitle;
