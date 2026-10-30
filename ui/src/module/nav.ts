import {
  ChartLineIcon,
  CpuIcon,
  CubeIcon,
  type Icon,
  ListMagnifyingGlassIcon,
} from "@phosphor-icons/react";

import { AlchemyPath } from "@/module/paths";
import { AlchemyNavItem } from "@/module/types";

export const ALCHEMY_NAV_ITEMS: AlchemyNavItem[] = [
  AlchemyNavItem.OBSERVABILITY,
  AlchemyNavItem.FUNCTIONS,
  AlchemyNavItem.HOSTS,
  AlchemyNavItem.INVOCATIONS,
];

export const ALCHEMY_NAV_ITEM_TO_LABEL_MAP: Record<AlchemyNavItem, string> = {
  [AlchemyNavItem.OBSERVABILITY]: "Observability",
  [AlchemyNavItem.FUNCTIONS]: "Functions",
  [AlchemyNavItem.HOSTS]: "Hosts",
  [AlchemyNavItem.INVOCATIONS]: "Invocations",
};

export const ALCHEMY_NAV_ITEM_TO_ICON_MAP: Record<AlchemyNavItem, Icon> = {
  [AlchemyNavItem.OBSERVABILITY]: ChartLineIcon,
  [AlchemyNavItem.FUNCTIONS]: CubeIcon,
  [AlchemyNavItem.HOSTS]: CpuIcon,
  [AlchemyNavItem.INVOCATIONS]: ListMagnifyingGlassIcon,
};

export const ALCHEMY_NAV_ITEM_TO_PATH_MAP: Record<AlchemyNavItem, AlchemyPath> = {
  [AlchemyNavItem.OBSERVABILITY]: AlchemyPath.OBSERVABILITY,
  [AlchemyNavItem.FUNCTIONS]: AlchemyPath.FUNCTIONS,
  [AlchemyNavItem.HOSTS]: AlchemyPath.HOSTS,
  [AlchemyNavItem.INVOCATIONS]: AlchemyPath.INVOCATIONS,
};

export const ALCHEMY_NAV_ITEM_TO_KEYWORDS_MAP: Record<AlchemyNavItem, string[]> = {
  [AlchemyNavItem.OBSERVABILITY]: ["overview", "dashboard"],
  [AlchemyNavItem.FUNCTIONS]: ["images", "lambda"],
  [AlchemyNavItem.HOSTS]: ["instances", "firecracker", "capacity"],
  [AlchemyNavItem.INVOCATIONS]: ["runs", "calls", "logs"],
};

export const ALCHEMY_NAV_ITEM_TO_COMMAND_ID_MAP: Record<AlchemyNavItem, string> = {
  [AlchemyNavItem.OBSERVABILITY]: "go-observability",
  [AlchemyNavItem.FUNCTIONS]: "go-functions",
  [AlchemyNavItem.HOSTS]: "go-hosts",
  [AlchemyNavItem.INVOCATIONS]: "go-invocations",
};
