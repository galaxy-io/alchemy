import { type FC, type ReactNode, useCallback } from "react";

import { Outlet } from "@tanstack/react-router";

import MainLayout from "@/layouts/main/MainLayout";

import CreateFunctionModal from "@/pages/functions/components/create/CreateFunctionModal";
import InvocationDrawer from "@/pages/invocations/components/drawer/InvocationDrawer";

import { useAlchemyLayoutSearch, useAlchemySearchUpdate } from "@/module/hooks";
import type { AlchemyLayoutSearch } from "@/module/schemas";
import { Flow } from "@/module/types";

export interface AlchemyLayoutProps {
  sidebarFooter?: ReactNode;
}

const AlchemyLayout: FC<AlchemyLayoutProps> = ({ sidebarFooter }) => {
  const updateSearch = useAlchemySearchUpdate<AlchemyLayoutSearch>();
  const { flow, functionId, invocationId } = useAlchemyLayoutSearch();

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
      <MainLayout sidebarFooter={sidebarFooter}>
        <Outlet />
      </MainLayout>
      <InvocationDrawer
        invocationId={invocationId}
        isOpen={!!invocationId}
        onClose={handleCloseDrawer}
      />
      <CreateFunctionModal
        isOpen={
          flow === Flow.CREATE_FUNCTION || (flow === Flow.CREATE_FUNCTION_VERSION && !!functionId)
        }
        functionId={flow === Flow.CREATE_FUNCTION_VERSION ? functionId : undefined}
        onClose={handleCloseFlow}
      />
    </>
  );
};

export default AlchemyLayout;
