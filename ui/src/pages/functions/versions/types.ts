import type { FunctionVersion } from "@/gen/functions/v1/functions_pb";

export interface FunctionVersionsTableRow {
  version: FunctionVersion;
  isCurrent: boolean;
}
