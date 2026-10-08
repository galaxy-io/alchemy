import "@/utils/serialization";

import { useCallback } from "react";

import { Outlet } from "@tanstack/react-router";

import MainLayout from "@/layouts/main/MainLayout";

import CreateFunctionModal from "@/pages/functions/components/create/CreateFunctionModal";
import InvocationDrawer from "@/pages/invocations/components/drawer/InvocationDrawer";

import { useRetainedWhileClosed } from "@/hooks/useRetainedWhileClosed";

import { useAlchemyLayoutSearch, useAlchemySearchUpdate } from "@/module/hooks";
import type { AlchemyLayoutSearch } from "@/module/schemas";
import { Flow } from "@/module/types";

/**
 * The module's own layout: the island with the sidebar and the screens, plus the overlays that open
 * from anywhere in the module through the search params `alchemyLayoutSearchSchema` validates on
 * this route. It fills whatever box the host gives it and renders no providers; the host supplies
 * the theme, transport, query client and command palette.
 */
const AlchemyLayout = () => {
  const updateSearch = useAlchemySearchUpdate<AlchemyLayoutSearch>();
  const { flow, functionId, invocationId } = useAlchemyLayoutSearch();
  const isDrawerOpen = !!invocationId;
  const drawerInvocationId = useRetainedWhileClosed(invocationId, isDrawerOpen);

  const handleCloseDrawer = useCallback(() => {
    void updateSearch(
      (prev) => {
        const { invocationId: _, ...rest } = prev;
        return rest;
      },
      { replace: true },
    );
  }, [updateSearch]);

  const handleCloseFlow = useCallback(() => {
    void updateSearch(
      (prev) => {
        const { flow: _, functionId: __, ...rest } = prev;
        return rest;
      },
      { replace: true },
    );
  }, [updateSearch]);

  return (
    <>
      <MainLayout>
        <Outlet />
      </MainLayout>
      <InvocationDrawer
        invocationId={drawerInvocationId}
        isOpen={isDrawerOpen}
        onClose={handleCloseDrawer}
      />
      {flow === Flow.CREATE_FUNCTION && <CreateFunctionModal onClose={handleCloseFlow} />}
      {flow === Flow.CREATE_FUNCTION_VERSION && !!functionId && (
        <CreateFunctionModal functionId={functionId} onClose={handleCloseFlow} />
      )}
    </>
  );
};

export default AlchemyLayout;
