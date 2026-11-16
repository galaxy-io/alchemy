import type { KeyValueInputPair } from "@galaxy-io/dls/inputs/KeyValueInput";

import type { Contract } from "@/gen/functions/v1/common_pb";
import type { FunctionSpec } from "@/gen/functions/v1/functions_pb";

export type FunctionContractKind = NonNullable<Contract["kind"]["case"]>;

export interface FunctionArrowField {
  name: string;
  type: string;
  nullable: boolean;
}

export enum FunctionContractSide {
  INPUT = "INPUT",
  OUTPUT = "OUTPUT",
}

export enum FunctionSourceKind {
  SOURCE = "SOURCE",
  IMAGE = "IMAGE",
}

export interface FunctionSourceFile {
  path: string;
  content: string;
}

export interface FunctionEnv {
  variables: KeyValueInputPair[];
  stored: KeyValueInputPair[];
  secrets: KeyValueInputPair[];
  secretNames: FunctionSpec["secrets"];
}
