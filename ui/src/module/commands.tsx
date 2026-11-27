import { useMemo } from "react";

import type { Transport } from "@connectrpc/connect";
import { PlusIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";

import type { CommandPaletteItem } from "@galaxy-io/dls/navigation/CommandPalette";

import { FUNCTION_CREATE_TITLE } from "@/components/functions/constants";
import FunctionRuntimeIcon from "@/components/functions/FunctionRuntimeIcon";
import { getFunctionCurrentVersion, getFunctionVersionRuntime } from "@/components/functions/utils";

import {
  ALCHEMY_COMMAND_GROUP_CREATE,
  ALCHEMY_COMMAND_GROUP_FUNCTIONS,
  ALCHEMY_COMMAND_GROUP_GO_TO,
} from "@/module/constants";
import { useAlchemyFlowOpen, useAlchemyMountedBase } from "@/module/hooks";
import {
  ALCHEMY_NAV_ITEM_TO_COMMAND_ID_MAP,
  ALCHEMY_NAV_ITEM_TO_ICON_MAP,
  ALCHEMY_NAV_ITEM_TO_KEYWORDS_MAP,
  ALCHEMY_NAV_ITEM_TO_LABEL_MAP,
  ALCHEMY_NAV_ITEM_TO_PATH_MAP,
  ALCHEMY_NAV_ITEMS,
} from "@/module/nav";
import { AlchemyPath, createAlchemyFlowSearch } from "@/module/paths";
import type { AlchemyLayoutSearch } from "@/module/schemas";
import { AlchemyNavItem, Flow } from "@/module/types";

import { useListFunctionsQuery } from "@/api/queries/functions";
import { useListRuntimesQuery } from "@/api/queries/runtimes";

const ROOT_PATH = "/";

export interface UseAlchemyCommandItemsInput {
  base?: string;
  transport?: Transport;
}

export const useAlchemyCommandItems = ({
  base,
  transport,
}: UseAlchemyCommandItemsInput = {}): CommandPaletteItem[] => {
  const navigate = useNavigate();
  const mountedBase = useAlchemyMountedBase();
  const openFlow = useAlchemyFlowOpen();

  const { data: functionsData } = useListFunctionsQuery({ options: { transport } });
  const { data: runtimesData } = useListRuntimesQuery({ options: { transport } });

  return useMemo(() => {
    const from = mountedBase ?? base ?? ROOT_PATH;

    const navigateFromBase = (
      to: AlchemyPath,
      { params, search }: { params?: Record<string, string>; search?: AlchemyLayoutSearch } = {},
    ) => void navigate({ from, to, params, search } as Parameters<typeof navigate>[0]);

    const openCreateFunction = () => {
      if (mountedBase) {
        openFlow(Flow.CREATE_FUNCTION);
        return;
      }
      navigateFromBase(AlchemyPath.FUNCTIONS, {
        search: createAlchemyFlowSearch(Flow.CREATE_FUNCTION),
      });
    };

    return [
      ...ALCHEMY_NAV_ITEMS.map((item) => ({
        id: ALCHEMY_NAV_ITEM_TO_COMMAND_ID_MAP[item],
        label: ALCHEMY_NAV_ITEM_TO_LABEL_MAP[item],
        icon: ALCHEMY_NAV_ITEM_TO_ICON_MAP[item],
        group: ALCHEMY_COMMAND_GROUP_GO_TO,
        keywords: ALCHEMY_NAV_ITEM_TO_KEYWORDS_MAP[item],
        onSelect: () => navigateFromBase(ALCHEMY_NAV_ITEM_TO_PATH_MAP[item]),
      })),
      {
        id: "new-function",
        label: FUNCTION_CREATE_TITLE,
        icon: PlusIcon,
        group: ALCHEMY_COMMAND_GROUP_CREATE,
        onSelect: openCreateFunction,
      },
      ...(functionsData?.functions ?? []).map((alchemyFunction) => {
        const runtime = getFunctionVersionRuntime(
          runtimesData?.runtimes ?? [],
          getFunctionCurrentVersion(alchemyFunction),
        );
        return {
          id: `function-${alchemyFunction.id}`,
          label: alchemyFunction.name,
          description: alchemyFunction.description || undefined,
          leading: runtime ? <FunctionRuntimeIcon runtime={runtime} /> : undefined,
          icon: runtime ? undefined : ALCHEMY_NAV_ITEM_TO_ICON_MAP[AlchemyNavItem.FUNCTIONS],
          group: ALCHEMY_COMMAND_GROUP_FUNCTIONS,
          onSelect: () =>
            navigateFromBase(AlchemyPath.FUNCTION, { params: { id: alchemyFunction.id } }),
        };
      }),
    ];
  }, [base, mountedBase, navigate, openFlow, functionsData?.functions, runtimesData?.runtimes]);
};
