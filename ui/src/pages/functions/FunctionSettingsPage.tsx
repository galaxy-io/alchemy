import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";

import { FUNCTION_SETTINGS_PAGE_MAX_WIDTH } from "@/pages/functions/settings/constants";
import FunctionSettingsPageDanger from "@/pages/functions/settings/FunctionSettingsPageDanger";
import FunctionSettingsPageGeneral from "@/pages/functions/settings/FunctionSettingsPageGeneral";
import FunctionSettingsPageRuntime from "@/pages/functions/settings/FunctionSettingsPageRuntime";

const FunctionSettingsPage = () => (
  <Flex
    direction={FlexDirection.COLUMN}
    gap={12}
    padding={16}
    maxWidth={FUNCTION_SETTINGS_PAGE_MAX_WIDTH}
  >
    <FunctionSettingsPageGeneral />
    <FunctionSettingsPageRuntime />
    <FunctionSettingsPageDanger />
  </Flex>
);

export default FunctionSettingsPage;
