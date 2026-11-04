import type { FC } from "react";

import { match } from "ts-pattern";

import Button, { ButtonSize, ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import Alert, { AlertVariant } from "@galaxy-io/dls/feedback/Alert";

import {
  type Function as AlchemyFunction,
  FunctionVersionStatus,
} from "@/gen/functions/v1/functions_pb";

import { useAlchemyNavigate } from "@/module/hooks";
import { AlchemyPath } from "@/module/paths";

import { formatVersion } from "@/utils/format";

interface FunctionPageBannerProps {
  alchemyFunction: AlchemyFunction;
}

const FunctionPageBanner: FC<FunctionPageBannerProps> = ({ alchemyFunction }) => {
  const navigate = useAlchemyNavigate();
  const newest = alchemyFunction.versions[0];

  if (!newest) return null;

  const viewBuildAction = (
    <Button
      label="View build"
      size={ButtonSize.SMALL}
      variant={ButtonVariant.SECONDARY}
      onClick={() =>
        void navigate({
          to: AlchemyPath.FUNCTION_VERSIONS,
          params: { id: alchemyFunction.id },
          search: { version: newest.version },
        })
      }
    />
  );

  return match(newest.status)
    .with(FunctionVersionStatus.BUILDING, () => (
      <Alert
        isBanner
        color="blue"
        header={`Building ${formatVersion(newest.version)}`}
        actions={viewBuildAction}
      >
        {newest.statusMessage || "Queued"}
      </Alert>
    ))
    .with(FunctionVersionStatus.FAILED, () => (
      <Alert
        isBanner
        variant={AlertVariant.ERROR}
        header="Latest version failed to build"
        actions={viewBuildAction}
      >
        {newest.statusMessage}
      </Alert>
    ))
    .otherwise(() => null);
};

export default FunctionPageBanner;
