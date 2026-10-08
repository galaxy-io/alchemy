import { ArrowSquareOutIcon, DotsThreeIcon, FlaskIcon } from "@phosphor-icons/react";

import Button, { ButtonSize, ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import Menu, { MenuItem, MenuSeparator } from "@galaxy-io/dls/menu/Menu";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import { createInvocationCurl } from "@/pages/invocations/components/drawer/utils";

import { useAlchemyNavigate } from "@/module/hooks";

interface InvocationDrawerActionsProps {
  invocation: Invocation;
  onClose: () => void;
}

const InvocationDrawerActions = ({ invocation, onClose }: InvocationDrawerActionsProps) => {
  const navigateAlchemy = useAlchemyNavigate();

  const handleOpenInPlayground = () => {
    onClose();
    void navigateAlchemy({
      to: "./images/$id/workbench",
      params: { id: invocation.functionId },
      search: { version: invocation.version },
    });
  };

  const handleGoToFunction = () => {
    onClose();
    void navigateAlchemy({ to: "./images/$id", params: { id: invocation.functionId } });
  };

  const handleCopyCurl = () => {
    void navigator.clipboard.writeText(createInvocationCurl(invocation));
  };

  return (
    <Menu
      trigger={
        <Button
          icon={DotsThreeIcon}
          ariaLabel="More actions"
          tooltip="More actions"
          size={ButtonSize.SMALL}
          variant={ButtonVariant.TERTIARY}
        />
      }
    >
      <MenuItem label="Open in playground" icon={FlaskIcon} onSelect={handleOpenInPlayground} />
      <MenuItem label="Go to function" icon={ArrowSquareOutIcon} onSelect={handleGoToFunction} />
      <MenuSeparator />
      <MenuItem label="Copy as curl" onSelect={handleCopyCurl} />
    </Menu>
  );
};

export default InvocationDrawerActions;
