import { match } from "ts-pattern";

import FunctionContractCanvas from "@/pages/functions/components/contract/FunctionContractCanvas";
import FunctionContractIsland from "@/pages/functions/components/contract/FunctionContractIsland";
import { FUNCTION_CONTRACT_KIND_TO_LABEL_MAP } from "@/pages/functions/constants";
import FunctionContractFields from "@/pages/functions/contract/FunctionContractFields";
import FunctionContractSchema from "@/pages/functions/contract/FunctionContractSchema";
import { useFunctionVersion } from "@/pages/functions/hooks/useFunctionVersion";

const FunctionContractPage = () => {
  const version = useFunctionVersion();
  const kind = version?.spec?.contract?.kind;

  if (!kind?.case) return null;

  const caption = FUNCTION_CONTRACT_KIND_TO_LABEL_MAP[kind.case];
  const [input, output] = match(kind)
    .with({ case: "jsonSchema" }, ({ value }) => [
      <FunctionContractSchema key="input" value={value.input} />,
      <FunctionContractSchema key="output" value={value.output} />,
    ])
    .with({ case: "arrow" }, ({ value }) => [
      <FunctionContractFields key="input" schema={value.inputSchema} />,
      <FunctionContractFields key="output" schema={value.outputSchema} />,
    ])
    .exhaustive();

  return (
    <FunctionContractCanvas
      input={
        <FunctionContractIsland label="Input" caption={caption}>
          {input}
        </FunctionContractIsland>
      }
      output={
        <FunctionContractIsland label="Output" caption={caption}>
          {output}
        </FunctionContractIsland>
      }
    />
  );
};

export default FunctionContractPage;
