import type { FC } from "react";

import Box, { BoxVariant } from "@galaxy-io/dls/layout/Box";
import Grid from "@galaxy-io/dls/layout/Grid";
import { EMPTY_VALUE, formatBytes } from "@galaxy-io/dls/utils/format";

import type { FunctionVersion } from "@/gen/functions/v1/functions_pb";

import KeyValueList from "@/components/KeyValueList";
import KeyValueListRow from "@/components/KeyValueListRow";

import { FUNCTION_CONTRACT_KIND_TO_LABEL_MAP } from "@/pages/functions/constants";
import { FUNCTION_VERSIONS_DETAILS_COLUMNS } from "@/pages/functions/versions/constants";
import FunctionVersionsBuildLog from "@/pages/functions/versions/FunctionVersionsBuildLog";

import { formatMillis } from "@/utils/format";

interface FunctionVersionsDetailsProps {
  version: FunctionVersion;
}

const FunctionVersionsDetails: FC<FunctionVersionsDetailsProps> = ({ version }) => {
  const { spec } = version;
  const contractKind = spec?.contract?.kind.case;

  return (
    <Box padding={12}>
      <Grid columns={FUNCTION_VERSIONS_DETAILS_COLUMNS} gap={12}>
        <KeyValueList variant={BoxVariant.SECONDARY}>
          <KeyValueListRow label="Digest" value={version.imageDigest || EMPTY_VALUE} isMono />
          <KeyValueListRow
            label="Contract"
            value={contractKind ? FUNCTION_CONTRACT_KIND_TO_LABEL_MAP[contractKind] : EMPTY_VALUE}
          />
          <KeyValueListRow
            label="Command"
            value={spec?.command.length ? spec.command.join(" ") : "Image entrypoint"}
            isMono
          />
          <KeyValueListRow
            label="Timeout"
            value={spec?.timeoutMs ? formatMillis(spec.timeoutMs) : EMPTY_VALUE}
            isMono
          />
          <KeyValueListRow
            label="Root filesystem"
            value={
              version.rootfsBytes ? formatBytes(version.rootfsBytes, { binary: true }) : EMPTY_VALUE
            }
            isMono
          />
        </KeyValueList>
        <FunctionVersionsBuildLog buildLog={version.buildLog} />
      </Grid>
    </Box>
  );
};

export default FunctionVersionsDetails;
