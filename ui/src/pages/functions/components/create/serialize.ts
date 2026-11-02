import { create, type JsonObject } from "@bufbuild/protobuf";

import { type Contract, ContractSchema, InvocationProtocol } from "@/gen/functions/v1/common_pb";
import {
  type Function as AlchemyFunction,
  CreateFunctionRequestSchema,
  CreateFunctionVersionRequestSchema,
  type FunctionSpec,
  FunctionSpecSchema,
} from "@/gen/functions/v1/functions_pb";

import type { CreateFunctionModalState } from "@/pages/functions/components/create/types";
import { getCreateFunctionModalRuntime } from "@/pages/functions/components/create/utils";
import { FunctionContractSide, FunctionSourceKind } from "@/pages/functions/types";
import { createFunctionSource, encodeFunctionArrowFields } from "@/pages/functions/utils";

const mapCreateFunctionModalStateToContract = (state: CreateFunctionModalState): Contract =>
  state.contractKind === "jsonSchema"
    ? create(ContractSchema, {
        kind: {
          case: "jsonSchema",
          value: {
            input: JSON.parse(state.schemaTexts[FunctionContractSide.INPUT]) as JsonObject,
            output: JSON.parse(state.schemaTexts[FunctionContractSide.OUTPUT]) as JsonObject,
          },
        },
      })
    : create(ContractSchema, {
        kind: {
          case: "arrow",
          value: {
            inputSchema: encodeFunctionArrowFields(state.arrowFields[FunctionContractSide.INPUT]),
            outputSchema: encodeFunctionArrowFields(state.arrowFields[FunctionContractSide.OUTPUT]),
          },
        },
      });

export const mapCreateFunctionModalStateToSpec = (
  state: CreateFunctionModalState,
): FunctionSpec | undefined => {
  const isSource = state.sourceKind === FunctionSourceKind.SOURCE;
  try {
    return create(FunctionSpecSchema, {
      image: isSource ? (getCreateFunctionModalRuntime(state)?.image ?? "") : state.image.trim(),
      source: isSource ? createFunctionSource(state.sourceFiles) : undefined,
      command: state.command,
      env: Object.fromEntries(
        state.env
          .filter((entry) => !entry.isSecret && entry.key.trim())
          .map((entry) => [entry.key.trim(), entry.value]),
      ),
      secrets: Object.fromEntries(
        state.env
          .filter((entry) => entry.isSecret && !entry.value && state.secretNames[entry.key.trim()])
          .map((entry) => [entry.key.trim(), state.secretNames[entry.key.trim()]]),
      ),
      protocol: InvocationProtocol.EXEC,
      contract: mapCreateFunctionModalStateToContract(state),
      resources: { vcpus: state.vcpus, memoryMib: state.memoryMib },
      timeoutMs: BigInt(Math.round(state.timeoutMs)),
    });
  } catch {
    return undefined;
  }
};

const mapCreateFunctionModalStateToSecretValues = (state: CreateFunctionModalState) =>
  Object.fromEntries(
    state.env
      .filter((entry) => entry.isSecret && entry.key.trim() && entry.value)
      .map((entry) => [entry.key.trim(), entry.value]),
  );

export const mapCreateFunctionModalStateToRequest = (
  state: CreateFunctionModalState,
  spec: FunctionSpec,
) =>
  create(CreateFunctionRequestSchema, {
    name: state.name.trim(),
    description: state.description.trim(),
    spec,
    secretValues: mapCreateFunctionModalStateToSecretValues(state),
  });

export const mapCreateFunctionModalStateToVersionRequest = (
  state: CreateFunctionModalState,
  functionId: AlchemyFunction["id"],
  spec: FunctionSpec,
) =>
  create(CreateFunctionVersionRequestSchema, {
    functionId,
    spec,
    secretValues: mapCreateFunctionModalStateToSecretValues(state),
  });
