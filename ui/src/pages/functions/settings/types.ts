import type { Function as AlchemyFunction } from "@/gen/functions/v1/functions_pb";

export interface FunctionSettingsPageGeneralState {
  name: AlchemyFunction["name"];
  description: AlchemyFunction["description"];
}
