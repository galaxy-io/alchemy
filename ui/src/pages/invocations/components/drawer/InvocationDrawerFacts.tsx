import type { FC } from "react";

import Link from "@galaxy-io/dls/links/Link";
import Text, { TextSize } from "@galaxy-io/dls/text/Text";
import { EMPTY_VALUE } from "@galaxy-io/dls/utils/format";

import type { Invocation } from "@/gen/functions/v1/invocations_pb";

import FunctionName from "@/components/functions/FunctionName";
import InvocationStartKind from "@/components/invocations/InvocationStartKind";
import KeyValueList from "@/components/KeyValueList";
import KeyValueListRow from "@/components/KeyValueListRow";
import RouterLink from "@/components/RouterLink";

import { AlchemyPath, createAlchemyHref } from "@/module/paths";

import { formatTimestamp, formatVersion } from "@/utils/format";

interface InvocationDrawerFactsProps {
  invocation: Invocation;
}

const InvocationDrawerFacts: FC<InvocationDrawerFactsProps> = ({ invocation }) => (
  <KeyValueList>
    <KeyValueListRow
      label="Function"
      value={
        <Link
          href={createAlchemyHref(AlchemyPath.FUNCTION, { id: invocation.functionId })}
          as={RouterLink}
        >
          <Text size={TextSize.BODY_SM}>
            <FunctionName functionId={invocation.functionId} />
          </Text>
        </Link>
      }
    />
    <KeyValueListRow label="Version" value={formatVersion(invocation.version)} />
    <KeyValueListRow
      label="Start"
      value={<InvocationStartKind startKind={invocation.startKind} />}
    />
    <KeyValueListRow label="Instance" value={invocation.instanceId || EMPTY_VALUE} isMono />
    <KeyValueListRow label="Created" value={formatTimestamp(invocation.createdAt)} />
  </KeyValueList>
);

export default InvocationDrawerFacts;
