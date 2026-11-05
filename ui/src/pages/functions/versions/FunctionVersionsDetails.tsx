import type { FC } from "react";

import Box, { BoxVariant } from "@galaxy-io/dls/layout/Box";
import Grid from "@galaxy-io/dls/layout/Grid";
import { EMPTY_VALUE, formatBytes } from "@galaxy-io/dls/utils/format";

import type { FunctionVersion } from "@/gen/functions/v1/functions_pb";

import Stat from "@/components/Stat";

import { FUNCTION_CONTRACT_KIND_TO_LABEL_MAP } from "@/pages/functions/constants";
import { FUNCTION_VERSIONS_DETAILS_COLUMNS } from "@/pages/functions/versions/constants";
import FunctionVersionsDetailsFiles from "@/pages/functions/versions/FunctionVersionsDetailsFiles";

interface FunctionVersionsDetailsProps {
  version: FunctionVersion;
}

const FunctionVersionsDetails: FC<FunctionVersionsDetailsProps> = ({ version }) => {
  const { spec } = version;
  const contractKind = spec?.contract?.kind.case;

  return (
    <Box padding={16} variant={BoxVariant.PRIMARY}>
      <Grid columns={FUNCTION_VERSIONS_DETAILS_COLUMNS} gap={24}>
        <Stat label="Digest" value={version.imageDigest || EMPTY_VALUE} />
        <Stat
          label="Contract"
          value={contractKind ? FUNCTION_CONTRACT_KIND_TO_LABEL_MAP[contractKind] : EMPTY_VALUE}
        />
        <FunctionVersionsDetailsFiles files={spec?.source?.files ?? []} />
        <Stat label="Command" value={spec?.command.length ? spec.command.join(" ") : EMPTY_VALUE} />
        <Stat
          label="Root filesystem"
          align="right"
          value={
            version.rootfsBytes ? formatBytes(version.rootfsBytes, { binary: true }) : EMPTY_VALUE
          }
        />
      </Grid>
    </Box>
  );
};

export default FunctionVersionsDetails;
