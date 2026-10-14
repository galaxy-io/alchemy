import { create, type JsonObject } from "@bufbuild/protobuf";

import {
  ArrowContractSchema,
  type Contract,
  ContractSchema,
  JsonSchemaContractSchema,
  ResourcesSchema,
} from "@/gen/functions/v1/common_pb";
import {
  type Function as AlchemyFunction,
  type CreateFunctionRequest,
  CreateFunctionRequestSchema,
  type CreateFunctionVersionRequest,
  CreateFunctionVersionRequestSchema,
  type FunctionSpec,
  FunctionSpecSchema,
} from "@/gen/functions/v1/functions_pb";

import {
  CreateFunctionModalContractSide,
  type CreateFunctionModalState,
} from "@/pages/functions/components/create/types";
import { encodeFunctionArrowFields } from "@/pages/functions/utils";

const mapCreateFunctionModalStateToContract = (state: CreateFunctionModalState): Contract =>
  state.contractKind === "jsonSchema"
    ? create(ContractSchema, {
        kind: {
          case: "jsonSchema",
          value: create(JsonSchemaContractSchema, {
            input: JSON.parse(
              state.schemaTexts[CreateFunctionModalContractSide.INPUT],
            ) as JsonObject,
            output: JSON.parse(
              state.schemaTexts[CreateFunctionModalContractSide.OUTPUT],
            ) as JsonObject,
          }),
        },
      })
    : create(ContractSchema, {
        kind: {
          case: "arrow",
          value: create(ArrowContractSchema, {
            inputSchema: encodeFunctionArrowFields(
              state.arrowFields[CreateFunctionModalContractSide.INPUT],
            ),
            outputSchema: encodeFunctionArrowFields(
              state.arrowFields[CreateFunctionModalContractSide.OUTPUT],
            ),
          }),
        },
      });

export const mapCreateFunctionModalStateToSpec = (
  state: CreateFunctionModalState,
): FunctionSpec | null => {
  try {
    return create(FunctionSpecSchema, {
      image: state.image.trim(),
      command: state.command,
      env: Object.fromEntries(
        state.env
          .filter((entry) => entry.key.trim() !== "")
          .map((entry) => [entry.key.trim(), entry.value]),
      ),
      protocol: state.protocol,
      contract: mapCreateFunctionModalStateToContract(state),
      resources: create(ResourcesSchema, { vcpus: state.vcpus, memoryMib: state.memoryMib }),
      timeoutMs: BigInt(Math.round(state.timeoutMs)),
    });
  } catch {
    return null;
  }
};

export const mapCreateFunctionModalStateToRequest = (
  state: CreateFunctionModalState,
  spec: FunctionSpec,
): CreateFunctionRequest =>
  create(CreateFunctionRequestSchema, {
    name: state.name.trim(),
    description: state.description.trim(),
    spec,
  });

export const mapCreateFunctionModalStateToVersionRequest = (
  functionId: AlchemyFunction["id"],
  spec: FunctionSpec,
): CreateFunctionVersionRequest => create(CreateFunctionVersionRequestSchema, { functionId, spec });
