import type { Contract } from "@/gen/functions/v1/common_pb";

export type FunctionContractKind = NonNullable<Contract["kind"]["case"]>;

export interface FunctionArrowField {
  name: string;
  type: string;
  nullable: boolean;
}
