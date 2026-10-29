import type { FC } from "react";

import { FileIcon } from "@phosphor-icons/react";

import Icon, { IconVariant } from "@galaxy-io/dls/icons/Icon";

import type { Runtime } from "@/gen/functions/v1/functions_pb";

import FunctionRuntimeIcon from "@/pages/functions/components/FunctionRuntimeIcon";
import { getFunctionSourceRuntime } from "@/pages/functions/utils";

interface FunctionSourceFileIconProps {
  path: string;
  runtimes: Runtime[];
  size?: number;
}

const FunctionSourceFileIcon: FC<FunctionSourceFileIconProps> = ({ path, runtimes, size = 16 }) => {
  const runtime = getFunctionSourceRuntime(runtimes, path);

  if (!runtime) {
    return <Icon component={FileIcon} size={size} variant={IconVariant.SECONDARY} />;
  }

  return <FunctionRuntimeIcon runtime={runtime} size={size} />;
};

export default FunctionSourceFileIcon;
