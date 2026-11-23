import type { FC } from "react";

import { styled } from "@linaria/react";
import { match } from "ts-pattern";

import { GalaxyTheme } from "@galaxy-io/dls/theme/enums";
import { useGalaxyTheme } from "@galaxy-io/dls/theme/useGalaxyTheme";

import type { Template } from "@/gen/functions/v1/templates_pb";

import {
  CREATE_FUNCTION_MODAL_TEMPLATE_GATEWAY_LABEL,
  CREATE_FUNCTION_MODAL_TEMPLATE_LOCKUP_HEIGHT,
} from "@/pages/functions/components/create/constants";

const CreateFunctionModalTemplateLockupImage = styled.img<{ $height: number }>`
  display: block;
  height: ${({ $height }) => $height}px;
  width: auto;
`;

interface CreateFunctionModalTemplateLockupProps {
  template: Pick<Template, "darkLockupUrl" | "lightLockupUrl">;
}

const CreateFunctionModalTemplateLockup: FC<CreateFunctionModalTemplateLockupProps> = ({
  template,
}) => {
  const { activeTheme } = useGalaxyTheme();
  const url = match(activeTheme)
    .with(GalaxyTheme.DARK, () => template.darkLockupUrl)
    .with(GalaxyTheme.LIGHT, () => template.lightLockupUrl)
    .exhaustive();

  return (
    <CreateFunctionModalTemplateLockupImage
      $height={CREATE_FUNCTION_MODAL_TEMPLATE_LOCKUP_HEIGHT}
      src={url}
      alt={CREATE_FUNCTION_MODAL_TEMPLATE_GATEWAY_LABEL}
    />
  );
};

export default CreateFunctionModalTemplateLockup;
