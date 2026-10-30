import type { Contract } from "@/gen/functions/v1/common_pb";

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
