import type { ReactNode } from "react";

import { create } from "@bufbuild/protobuf";
import { match } from "ts-pattern";

import Button, { ButtonSize, ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import Alert, { AlertVariant } from "@galaxy-io/dls/feedback/Alert";

import { FunctionVersionStatus, GetFunctionRequestSchema } from "@/gen/functions/v1/functions_pb";

import FunctionInfoAlert from "@/pages/functions/components/FunctionInfoAlert";
import { formatFunctionVersion } from "@/pages/functions/utils";

import { useSuspenseGetFunctionQuery } from "@/api/queries/functions";

import { useAlchemyNavigate, useFunctionParams } from "@/module/hooks";

const FunctionPageBanner = () => {
  const navigate = useAlchemyNavigate();
  const { id } = useFunctionParams();

  const { data } = useSuspenseGetFunctionQuery({
    input: create(GetFunctionRequestSchema, { id, includeVersions: true }),
  });
  const newest = data.function?.versions[0];

  if (!newest) return null;

  const handleViewBuild = () => {
    void navigate({
      to: "./images/$id/versions",
      params: { id },
      search: { version: newest.version },
    });
  };

  return match<FunctionVersionStatus, ReactNode>(newest.status)
    .with(FunctionVersionStatus.BUILDING, () => (
      <FunctionInfoAlert
        isBanner
        header={`Building ${formatFunctionVersion(newest.version)}`}
        actions={
          <Button
            label="View build"
            size={ButtonSize.SMALL}
            variant={ButtonVariant.SECONDARY}
            onClick={handleViewBuild}
          />
        }
      >
        {newest.statusMessage || "Queued"}
      </FunctionInfoAlert>
    ))
    .with(FunctionVersionStatus.FAILED, () => (
      <Alert
        isBanner
        variant={AlertVariant.ERROR}
        header={`${formatFunctionVersion(newest.version)} failed to build`}
        actions={
          <Button
            label="View build"
            size={ButtonSize.SMALL}
            variant={ButtonVariant.SECONDARY}
            onClick={handleViewBuild}
          />
        }
      >
        {newest.statusMessage}
      </Alert>
    ))
    .otherwise(() => null);
};

export default FunctionPageBanner;
