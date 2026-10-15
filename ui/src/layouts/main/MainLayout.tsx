import type { FC, PropsWithChildren, ReactNode } from "react";

import { useLocalStorage } from "@galaxy-io/dls/hooks/useLocalStorage";
import AppFrame from "@galaxy-io/dls/layout/AppFrame";

import { MAIN_LAYOUT_SIDEBAR_COLLAPSED_STORAGE_KEY } from "@/layouts/main/constants";
import MainLayoutSidebar from "@/layouts/main/MainLayoutSidebar";

interface MainLayoutProps {
  sidebarFooter?: ReactNode;
}

const MainLayout: FC<PropsWithChildren<MainLayoutProps>> = ({ sidebarFooter, children }) => {
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useLocalStorage<boolean>(
    MAIN_LAYOUT_SIDEBAR_COLLAPSED_STORAGE_KEY,
    false,
  );

  return (
    <AppFrame
      sidebar={<MainLayoutSidebar footer={sidebarFooter} />}
      isCollapsed={isSidebarCollapsed}
      onCollapsedChange={setIsSidebarCollapsed}
    >
      {children}
    </AppFrame>
  );
};

export default MainLayout;
