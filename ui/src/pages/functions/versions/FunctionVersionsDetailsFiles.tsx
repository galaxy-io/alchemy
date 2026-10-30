import type { FC } from "react";

import Flex, { AlignItems, FlexDirection } from "@galaxy-io/dls/layout/Flex";
import Text, { TextSize, TextVariant } from "@galaxy-io/dls/text/Text";
import { FontFamily } from "@galaxy-io/dls/theme/enums";
import { EMPTY_VALUE } from "@galaxy-io/dls/utils/format";

import type { SourceFile } from "@/gen/functions/v1/functions_pb";

import FunctionSourceFileIcon from "@/pages/functions/components/FunctionSourceFileIcon";
import { FUNCTION_VERSIONS_DETAILS_FILE_ICON_SIZE } from "@/pages/functions/versions/constants";

import { useListRuntimesQuery } from "@/api/queries/runtimes";

interface FunctionVersionsDetailsFilesProps {
  files: SourceFile[];
}

const FunctionVersionsDetailsFiles: FC<FunctionVersionsDetailsFilesProps> = ({ files }) => {
  const { data } = useListRuntimesQuery();
  const runtimes = data?.runtimes ?? [];

  return (
    <Flex direction={FlexDirection.COLUMN} gap={4} minWidth={0}>
      <Text size={TextSize.CAPTION} variant={TextVariant.TERTIARY}>
        Files
      </Text>
      <Flex alignItems={AlignItems.CENTER} gap={12} minWidth={0} overflow="hidden">
        {files.length ? (
          files.map(({ path }) => (
            <Flex key={path} alignItems={AlignItems.CENTER} gap={4} minWidth={0}>
              <FunctionSourceFileIcon
                path={path}
                runtimes={runtimes}
                size={FUNCTION_VERSIONS_DETAILS_FILE_ICON_SIZE}
              />
              <Text
                size={TextSize.BODY_SM}
                family={FontFamily.MONO}
                lineClamp={1}
                shouldTooltipOnOverflow
              >
                {path}
              </Text>
            </Flex>
          ))
        ) : (
          <Text size={TextSize.BODY_SM} family={FontFamily.MONO}>
            {EMPTY_VALUE}
          </Text>
        )}
      </Flex>
    </Flex>
  );
};

export default FunctionVersionsDetailsFiles;
