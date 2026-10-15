import { type FC, useMemo } from "react";

import { MoonIcon, SunIcon } from "@phosphor-icons/react";

import { useDisclosure } from "@galaxy-io/dls/hooks/useDisclosure";
import CommandPalette, { type CommandPaletteItem } from "@galaxy-io/dls/navigation/CommandPalette";
import { GalaxyTheme } from "@galaxy-io/dls/theme/enums";
import { useGalaxyTheme } from "@galaxy-io/dls/theme/useGalaxyTheme";

import { useAlchemyCommandItems } from "@/module/commands";

import {
  APP_LAYOUT_COMMAND_PALETTE_GROUP_PREFERENCES,
  APP_LAYOUT_COMMAND_PALETTE_PLACEHOLDER,
  APP_LAYOUT_COMMAND_PALETTE_STORAGE_KEY,
} from "@/host/layouts/app/constants";

const AppLayoutCommandPalette: FC = () => {
  const palette = useDisclosure();
  const { activeTheme, setTheme } = useGalaxyTheme();
  const alchemyItems = useAlchemyCommandItems();
  const isDark = activeTheme === GalaxyTheme.DARK;

  const items = useMemo<CommandPaletteItem[]>(
    () => [
      ...alchemyItems,
      {
        id: "toggle-theme",
        label: isDark ? "Switch to light theme" : "Switch to dark theme",
        icon: isDark ? SunIcon : MoonIcon,
        group: APP_LAYOUT_COMMAND_PALETTE_GROUP_PREFERENCES,
        keywords: ["theme", "appearance"],
        onSelect: () => setTheme(isDark ? GalaxyTheme.LIGHT : GalaxyTheme.DARK),
      },
    ],
    [alchemyItems, isDark, setTheme],
  );

  return (
    <CommandPalette
      items={items}
      isOpen={palette.isOpen}
      onOpenChange={palette.setIsOpen}
      shouldBindHotKey
      placeholder={APP_LAYOUT_COMMAND_PALETTE_PLACEHOLDER}
      storageKey={APP_LAYOUT_COMMAND_PALETTE_STORAGE_KEY}
    />
  );
};

export default AppLayoutCommandPalette;
