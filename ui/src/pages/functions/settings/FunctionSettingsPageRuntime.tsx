import type { FC } from "react";

import JsonViewer from "@galaxy-io/dls/json/JsonViewer";
import Widget from "@galaxy-io/dls/widget/Widget";

import { useFunctionVersion } from "@/pages/functions/hooks/useFunctionVersion";
import { FUNCTION_SETTINGS_PAGE_RUNTIME_EXPANDED_DEPTH } from "@/pages/functions/settings/constants";
import { createFunctionSpecJson } from "@/pages/functions/utils";

const FunctionSettingsPageRuntime: FC = () => {
  const spec = useFunctionVersion()?.spec;
  if (!spec) return null;

  return (
    <Widget header="Runtime" isCollapsible defaultIsOpen>
      <JsonViewer
        ariaLabel="Runtime"
        data={createFunctionSpecJson(spec)}
        defaultExpandedDepth={FUNCTION_SETTINGS_PAGE_RUNTIME_EXPANDED_DEPTH}
      />
    </Widget>
  );
};

export default FunctionSettingsPageRuntime;
