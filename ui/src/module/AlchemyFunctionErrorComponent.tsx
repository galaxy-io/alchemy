import type { FC } from "react";

import { Code, ConnectError } from "@connectrpc/connect";
import type { ErrorComponentProps } from "@tanstack/react-router";

import FunctionNotFoundPage from "@/pages/functions/FunctionNotFoundPage";

import AlchemyErrorComponent from "@/module/AlchemyErrorComponent";

const AlchemyFunctionErrorComponent: FC<ErrorComponentProps> = (props) =>
  props.error instanceof ConnectError && props.error.code === Code.NotFound ? (
    <FunctionNotFoundPage />
  ) : (
    <AlchemyErrorComponent {...props} />
  );

export default AlchemyFunctionErrorComponent;
