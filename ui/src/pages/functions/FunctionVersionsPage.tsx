import Flex, { FlexDirection } from "@galaxy-io/dls/layout/Flex";

import FunctionVersionsTable from "@/pages/functions/versions/FunctionVersionsTable";

const FunctionVersionsPage = () => (
  <Flex direction={FlexDirection.COLUMN} grow={1} minHeight={0}>
    <FunctionVersionsTable />
  </Flex>
);

export default FunctionVersionsPage;
