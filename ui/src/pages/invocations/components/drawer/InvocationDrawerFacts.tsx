import { create } from "@bufbuild/protobuf";

import Link from "@galaxy-io/dls/links/Link";
import Text, { TextSize } from "@galaxy-io/dls/text/Text";

import { GetFunctionRequestSchema } from "@/gen/functions/v1/functions_pb";
import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import KeyValueList from "@/components/KeyValueList";
import KeyValueRow from "@/components/KeyValueRow";
import RouterLink from "@/components/RouterLink";

import { formatFunctionVersion } from "@/pages/functions/utils";
import InvocationStartKind from "@/pages/invocations/components/InvocationStartKind";

import { useGetFunctionQuery } from "@/api/queries/functions";

import { EMPTY_VALUE, formatTimestamp } from "@/utils/format";

interface InvocationDrawerFactsProps {
  invocation: Invocation;
}

const InvocationDrawerFacts = ({ invocation }: InvocationDrawerFactsProps) => {
  const { data: functionData } = useGetFunctionQuery({
    input: create(GetFunctionRequestSchema, { id: invocation.functionId }),
  });
  const fn = functionData?.function;

  return (
    <KeyValueList>
      <KeyValueRow
        label="Function"
        value={
          fn ? (
            <Link href={`./images/${fn.id}`} as={RouterLink}>
              <Text size={TextSize.BODY_SM}>{fn.name}</Text>
            </Link>
          ) : (
            invocation.functionId
          )
        }
      />
      <KeyValueRow label="Version" value={formatFunctionVersion(invocation.version)} isMono />
      <KeyValueRow label="Start" value={<InvocationStartKind startKind={invocation.startKind} />} />
      <KeyValueRow label="Instance" value={invocation.instanceId || EMPTY_VALUE} isMono />
      <KeyValueRow label="Caller" value={invocation.createdByUserId || EMPTY_VALUE} />
      <KeyValueRow label="Created" value={formatTimestamp(invocation.createdAt)} />
    </KeyValueList>
  );
};

export default InvocationDrawerFacts;
