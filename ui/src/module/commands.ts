import { FloppyDiskIcon, PlusIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";

import type { CommandPaletteItem } from "@galaxy-io/dls/navigation/CommandPalette";

import { useListFunctionsQuery } from "@/api/queries/functions";

import {
  ALCHEMY_COMMAND_GROUP_CREATE,
  ALCHEMY_COMMAND_GROUP_GO_TO,
  ALCHEMY_COMMAND_GROUP_IMAGES,
  ALCHEMY_COMMAND_NEW_FUNCTION_HOT_KEYS,
} from "@/module/constants";
import { useAlchemyMountedBase, useAlchemySearchUpdate } from "@/module/hooks";
import {
  ALCHEMY_NAV_ITEM_TO_COMMAND_ID_MAP,
  ALCHEMY_NAV_ITEM_TO_ICON_MAP,
  ALCHEMY_NAV_ITEM_TO_KEYWORDS_MAP,
  ALCHEMY_NAV_ITEM_TO_LABEL_MAP,
  ALCHEMY_NAV_ITEM_TO_PATH_MAP,
  ALCHEMY_NAV_ITEMS,
} from "@/module/nav";
import type { AlchemyLayoutSearch } from "@/module/schemas";
import { Flow } from "@/module/types";

const ROOT_PATH = "/";

interface UseAlchemyCommandItemsInput {
  base?: string;
}

/**
 * The module's command palette items. The host owns the palette and appends its own items. A host
 * whose palette is also open outside the module passes the path it mounts the module at as `base`,
 * since only a page inside the module knows it.
 */
export const useAlchemyCommandItems = ({
  base,
}: UseAlchemyCommandItemsInput = {}): CommandPaletteItem[] => {
  const navigate = useNavigate();
  const updateSearch = useAlchemySearchUpdate<AlchemyLayoutSearch>();
  const mountedBase = useAlchemyMountedBase();
  const from = mountedBase ?? base ?? ROOT_PATH;
  const { data } = useListFunctionsQuery();

  // The module cannot name the host's routes, so targets are relative strings resolved from `from`.
  const navigateFromBase = (to: string, params?: Record<string, string>) =>
    void navigate({ from, to, params } as Parameters<typeof navigate>[0]);

  const handleNewFunction = () => {
    if (mountedBase !== undefined) {
      void updateSearch((prev) => ({ ...prev, flow: Flow.CREATE_FUNCTION }));
      return;
    }
    void navigate({ href: `${from}?flow=${Flow.CREATE_FUNCTION}` });
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
      label: "New image",
      icon: PlusIcon,
      group: ALCHEMY_COMMAND_GROUP_CREATE,
      hotKeys: ALCHEMY_COMMAND_NEW_FUNCTION_HOT_KEYS,
      onSelect: handleNewFunction,
    },
    ...(data?.functions ?? []).map((fn) => ({
      id: `fn-${fn.id}`,
      label: fn.name,
      description: fn.description,
      icon: FloppyDiskIcon,
      group: ALCHEMY_COMMAND_GROUP_IMAGES,
      onSelect: () => navigateFromBase("./images/$id", { id: fn.id }),
    })),
  ];
};
