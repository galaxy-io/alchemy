import { type FC, useState } from "react";

import { styled } from "@linaria/react";
import { CodeIcon } from "@phosphor-icons/react";

import Icon, { IconVariant } from "@galaxy-io/dls/icons/Icon";
import { useGalaxyTheme } from "@galaxy-io/dls/theme/useGalaxyTheme";

import type { Runtime } from "@/gen/functions/v1/functions_pb";

import { getFunctionRuntimeIconUrl } from "@/components/functions/utils";

const FunctionRuntimeImage = styled.img<{ $size: number }>`
  display: block;
  width: ${({ $size }) => $size}px;
  height: ${({ $size }) => $size}px;
  object-fit: contain;
`;

interface FunctionRuntimeIconProps {
  runtime: Pick<Runtime, "label" | "darkIconUrl" | "lightIconUrl">;
  size?: number;
}

interface FunctionRuntimeIconState {
  failedUrl: string | undefined;
}

const FunctionRuntimeIcon: FC<FunctionRuntimeIconProps> = ({ runtime, size = 16 }) => {
  const { activeTheme } = useGalaxyTheme();
  const url = getFunctionRuntimeIconUrl(runtime, activeTheme);
  const [state, setState] = useState<FunctionRuntimeIconState>({ failedUrl: undefined });

  if (!url || state.failedUrl === url) {
    return <Icon component={CodeIcon} size={size} variant={IconVariant.SECONDARY} />;
  }

  return (
    <FunctionRuntimeImage
      src={url}
      alt={runtime.label}
      $size={size}
      onError={() => setState({ failedUrl: url })}
    />
  );
};

export default FunctionRuntimeIcon;
