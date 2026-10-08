import { Outlet } from "@tanstack/react-router";

import AppLayoutCommandPalette from "@/layouts/app/AppLayoutCommandPalette";

const AppLayout = () => {
  return (
    <>
      <Outlet />
      <AppLayoutCommandPalette />
    </>
  );
};

export default AppLayout;
