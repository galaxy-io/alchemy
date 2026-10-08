import { useMemo } from "react";

import JsonViewer from "@galaxy-io/dls/json/JsonViewer";
import Widget from "@galaxy-io/dls/widget/Widget";

import { useFunctionVersion } from "@/pages/functions/hooks/useFunctionVersion";
import { FUNCTION_SETTINGS_PAGE_RUNTIME_EXPANDED_DEPTH } from "@/pages/functions/settings/constants";
import { createFunctionSettingsRuntimeJson } from "@/pages/functions/settings/utils";

const FunctionSettingsPageRuntime = () => {
  const version = useFunctionVersion();
  const spec = version?.spec;

  const runtime = useMemo(() => spec && createFunctionSettingsRuntimeJson(spec), [spec]);

  if (!runtime) return null;

  return (
    <Widget header="Runtime" isCollapsible defaultIsOpen>
      <JsonViewer
        ariaLabel="Runtime"
        data={runtime}
        defaultExpandedDepth={FUNCTION_SETTINGS_PAGE_RUNTIME_EXPANDED_DEPTH}
      />
    </Widget>
  );
};

export default FunctionSettingsPageRuntime;
