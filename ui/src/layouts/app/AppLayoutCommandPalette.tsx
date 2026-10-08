import { MoonIcon, SunIcon } from "@phosphor-icons/react";

import { useDisclosure } from "@galaxy-io/dls/hooks/useDisclosure";
import CommandPalette, { type CommandPaletteItem } from "@galaxy-io/dls/navigation/CommandPalette";
import { GalaxyTheme } from "@galaxy-io/dls/theme/enums";
import { useGalaxyTheme } from "@galaxy-io/dls/theme/useGalaxyTheme";

import {
  APP_LAYOUT_COMMAND_PALETTE_GROUP_PREFERENCES,
  APP_LAYOUT_COMMAND_PALETTE_PLACEHOLDER,
  APP_LAYOUT_COMMAND_PALETTE_STORAGE_KEY,
} from "@/layouts/app/constants";

import { useAlchemyCommandItems } from "@/module/commands";

const AppLayoutCommandPalette = () => {
  const palette = useDisclosure();
  const { activeTheme, setTheme } = useGalaxyTheme();
  const alchemyItems = useAlchemyCommandItems();
  const isDark = activeTheme === GalaxyTheme.DARK;

  const items: CommandPaletteItem[] = [
    ...alchemyItems,
    {
      id: "toggle-theme",
      label: isDark ? "Switch to light theme" : "Switch to dark theme",
      icon: isDark ? SunIcon : MoonIcon,
      group: APP_LAYOUT_COMMAND_PALETTE_GROUP_PREFERENCES,
      onSelect: () => setTheme(isDark ? GalaxyTheme.LIGHT : GalaxyTheme.DARK),
    },
  ];

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
