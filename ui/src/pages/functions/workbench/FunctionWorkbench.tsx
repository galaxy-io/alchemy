import { type FC, useMemo, useState } from "react";

import { create } from "@bufbuild/protobuf";
import { HammerIcon, PlayIcon } from "@phosphor-icons/react";

import Button, { ButtonSize } from "@galaxy-io/dls/buttons/Button";
import Divider from "@galaxy-io/dls/layout/Divider";
import Flex, { AlignItems, FlexDirection, JustifyContent } from "@galaxy-io/dls/layout/Flex";
import ResizablePanels, { ResizablePanel } from "@galaxy-io/dls/layout/ResizablePanels";
import Text, { TextSize } from "@galaxy-io/dls/text/Text";
import { FontFamily, Orientation } from "@galaxy-io/dls/theme/enums";
import { ToastVariant } from "@galaxy-io/dls/toast/Toast";
import { useToast } from "@galaxy-io/dls/toast/useToast";

import {
  type Function as AlchemyFunction,
  CreateFunctionVersionRequestSchema,
  type FunctionVersion,
  FunctionVersionStatus,
} from "@/gen/functions/v1/functions_pb";
import { InvokeRequestSchema } from "@/gen/functions/v1/invocations_pb";

import { createFunctionSourceSpec, decodeFunctionSourceFile } from "@/pages/functions/utils";
import {
  FUNCTION_WORKBENCH_FILE_TO_PATH_MAP,
  FUNCTION_WORKBENCH_FILES_DEFAULT_WIDTH,
  FUNCTION_WORKBENCH_FILES_MAX_WIDTH,
  FUNCTION_WORKBENCH_FILES_MIN_WIDTH,
  FUNCTION_WORKBENCH_RESULT_DEFAULT_WIDTH,
  FUNCTION_WORKBENCH_RESULT_MAX_WIDTH,
  FUNCTION_WORKBENCH_RESULT_MIN_WIDTH,
  FUNCTION_WORKBENCH_STORAGE_KEY,
} from "@/pages/functions/workbench/constants";
import FunctionWorkbenchEditor from "@/pages/functions/workbench/FunctionWorkbenchEditor";
import FunctionWorkbenchFiles from "@/pages/functions/workbench/FunctionWorkbenchFiles";
import FunctionWorkbenchResult from "@/pages/functions/workbench/FunctionWorkbenchResult";
import type { FunctionWorkbenchState } from "@/pages/functions/workbench/types";
import {
  createFunctionWorkbenchDefaultInput,
  createFunctionWorkbenchTreeItems,
  encodeFunctionWorkbenchInput,
  getFunctionWorkbenchArrowSchema,
  getFunctionWorkbenchInputError,
  getFunctionWorkbenchSourcePath,
  isFunctionWorkbenchFile,
} from "@/pages/functions/workbench/utils";

import { useAlchemySearchUpdate, useFunctionWorkbenchSearch } from "@/module/hooks";
import type { FunctionSearch, FunctionWorkbenchSearch } from "@/module/schemas";

import {
  createGetFunctionVersionInput,
  useCreateFunctionVersionMutation,
  useGetFunctionVersionQuery,
} from "@/api/queries/function_versions";
import { useInvokeMutation } from "@/api/queries/invocations";

import { getErrorMessage } from "@/utils/errors";
import { formatVersion } from "@/utils/format";
import { formatJson, parseJson } from "@/utils/json";

interface FunctionWorkbenchProps {
  functionId: AlchemyFunction["id"];
  version: FunctionVersion | undefined;
}

const FunctionWorkbench: FC<FunctionWorkbenchProps> = ({ functionId, version }) => {
  const { toast } = useToast();
  const updateSearch = useAlchemySearchUpdate<FunctionWorkbenchSearch & FunctionSearch>();
  const { file } = useFunctionWorkbenchSearch();
  const { mutate: invoke, isPending: isRunning } = useInvokeMutation();
  const { mutate: createVersion, isPending: isBuilding } = useCreateFunctionVersionMutation();
  const hasSource = !!version?.spec?.source;
  const { data: sourceData } = useGetFunctionVersionQuery({
    input: createGetFunctionVersionInput(functionId, version?.version ?? 0n),
    options: { enabled: hasSource },
  });
  const sourceFiles =
    sourceData?.version?.spec?.source?.files ?? version?.spec?.source?.files ?? [];
  const originals = Object.fromEntries(
    sourceFiles.map(({ path, content }) => [path, decodeFunctionSourceFile(content)]),
  );

  const contract = version?.spec?.contract;
  const arrowSchema = useMemo(() => getFunctionWorkbenchArrowSchema(contract), [contract]);
  const [state, setState] = useState<FunctionWorkbenchState>(() => ({
    text: formatJson(createFunctionWorkbenchDefaultInput(contract, arrowSchema)),
    sources: {},
    response: undefined,
  }));
  const items = useMemo(() => createFunctionWorkbenchTreeItems(sourceFiles), [sourceFiles]);
  const sourcePath = getFunctionWorkbenchSourcePath(file);
  const source =
    sourcePath === undefined ? undefined : (state.sources[sourcePath] ?? originals[sourcePath]);
  const isDirty = Object.entries(state.sources).some(([path, text]) => text !== originals[path]);
  const canBuild = hasSource && !!sourceData && isDirty && !isBuilding;
  const title = isFunctionWorkbenchFile(file)
    ? FUNCTION_WORKBENCH_FILE_TO_PATH_MAP[file]
    : sourcePath;

  const parsed = parseJson(state.text);
  const inputError = parsed.error ?? getFunctionWorkbenchInputError(parsed.value, arrowSchema);
  const isReady = version?.status === FunctionVersionStatus.READY;
  const canRun = !inputError && isReady && !isRunning;

  const handleFileChange = (next: string) => {
    void updateSearch((prev) => ({ ...prev, file: next }), { replace: true });
  };

  const handleBuild = () => {
    const spec = sourceData?.version?.spec;
    if (!canBuild || !spec) return;
    const files = sourceFiles.map(({ path }) => ({
      path,
      content: state.sources[path] ?? originals[path] ?? "",
    }));
    createVersion(
      create(CreateFunctionVersionRequestSchema, {
        functionId,
        spec: createFunctionSourceSpec(spec, files),
      }),
      {
        onSuccess: ({ version: built }) => {
          toast({
            header: `${formatVersion(built?.version)} building`,
            variant: ToastVariant.SUCCESS,
          });
          void updateSearch((prev) => ({ ...prev, version: built?.version }), { replace: true });
        },
        onError: (error) => {
          toast({
            header: "Build failed",
            description: getErrorMessage(error, "Failed to start build"),
            variant: ToastVariant.ERROR,
          });
        },
      },
    );
  };

  const handleRun = () => {
    if (!canRun || parsed.value === undefined || !version) return;
    let input: Uint8Array;
    try {
      input = encodeFunctionWorkbenchInput(parsed.value, arrowSchema);
    } catch (error) {
      toast({
        header: "Run failed",
        description: getErrorMessage(error, "The rows do not match the input schema"),
        variant: ToastVariant.ERROR,
      });
      return;
    }
    invoke(create(InvokeRequestSchema, { functionId, version: version.version, input }), {
      onSuccess: (response) => {
        setState((prev) => ({ ...prev, response }));
      },
      onError: (error) => {
        toast({
          header: "Run failed",
          description: getErrorMessage(error, "Failed to invoke function"),
          variant: ToastVariant.ERROR,
        });
      },
    });
  };

  return (
    <Flex direction={FlexDirection.COLUMN} height="100%" minHeight={0}>
      <Flex
        alignItems={AlignItems.CENTER}
        justifyContent={JustifyContent.SPACE_BETWEEN}
        gap={8}
        padding={[8, 16]}
        shrink={0}
      >
        <Text size={TextSize.BODY_SM} family={FontFamily.MONO}>
          {title}
        </Text>
        <Flex gap={8}>
          {hasSource && (
            <Button
              label="Build"
              icon={HammerIcon}
              size={ButtonSize.SMALL}
              isDisabled={!canBuild}
              isLoading={isBuilding}
              tooltip={isDirty ? undefined : "Edit a file to build a new version"}
              onClick={handleBuild}
            />
          )}
          <Button
            label="Run"
            icon={PlayIcon}
            size={ButtonSize.SMALL}
            isDisabled={!canRun}
            isLoading={isRunning}
            tooltip={isReady ? undefined : "Only a ready version can run"}
            hotKeys={["mod", "enter"]}
            onClick={handleRun}
          />
        </Flex>
      </Flex>
      <Divider />
      <Flex grow={1} minHeight={0}>
        <ResizablePanels
          orientation={Orientation.HORIZONTAL}
          storageKey={FUNCTION_WORKBENCH_STORAGE_KEY}
          hasDividers
        >
          <ResizablePanel
            id="files"
            defaultValue={FUNCTION_WORKBENCH_FILES_DEFAULT_WIDTH}
            min={FUNCTION_WORKBENCH_FILES_MIN_WIDTH}
            max={FUNCTION_WORKBENCH_FILES_MAX_WIDTH}
            ariaLabel="Files"
          >
            <FunctionWorkbenchFiles items={items} file={file} onChange={handleFileChange} />
          </ResizablePanel>
          <ResizablePanel id="editor">
            <FunctionWorkbenchEditor
              file={file}
              version={version}
              input={state.text}
              inputError={inputError}
              source={source}
              onInputChange={(text) => setState((prev) => ({ ...prev, text }))}
              onSourceChange={(path, text) =>
                setState((prev) => ({ ...prev, sources: { ...prev.sources, [path]: text } }))
              }
              onRun={handleRun}
            />
          </ResizablePanel>
          <ResizablePanel
            id="result"
            defaultValue={FUNCTION_WORKBENCH_RESULT_DEFAULT_WIDTH}
            min={FUNCTION_WORKBENCH_RESULT_MIN_WIDTH}
            max={FUNCTION_WORKBENCH_RESULT_MAX_WIDTH}
            ariaLabel="Result"
          >
            <FunctionWorkbenchResult
              response={state.response}
              contract={contract}
              isRunning={isRunning}
            />
          </ResizablePanel>
        </ResizablePanels>
      </Flex>
    </Flex>
  );
};

export default FunctionWorkbench;
