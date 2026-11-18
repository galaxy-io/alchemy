import type { FC } from "react";

import { PlayIcon, PlusIcon } from "@phosphor-icons/react";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import { IconWeight } from "@galaxy-io/dls/icons/Icon";

import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";

import { getFunctionCurrentVersion } from "@/pages/functions/utils";

import { useAlchemyFlowOpen, useAlchemyNavigate } from "@/module/hooks";
import { AlchemyPath } from "@/module/paths";
import { Flow } from "@/module/types";

interface FunctionPageActionsProps {
  alchemyFunction: AlchemyFunction;
}

const FunctionPageActions: FC<FunctionPageActionsProps> = ({ alchemyFunction }) => {
  const navigate = useAlchemyNavigate();
  const openFlow = useAlchemyFlowOpen();

  return (
    <>
      <Button
        label="New version"
        icon={PlusIcon}
        variant={ButtonVariant.SECONDARY}
        onClick={() => openFlow(Flow.CREATE_FUNCTION_VERSION, { functionId: alchemyFunction.id })}
      />
      <Button
        label="Invoke"
        icon={PlayIcon}
        iconWeight={IconWeight.FILL}
        isDisabled={!getFunctionCurrentVersion(alchemyFunction)}
        onClick={() =>
          void navigate({ to: AlchemyPath.FUNCTION_WORKBENCH, params: { id: alchemyFunction.id } })
        }
      />
    </>
  );
};

export default FunctionPageActions;
