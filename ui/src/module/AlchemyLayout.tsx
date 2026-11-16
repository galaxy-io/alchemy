import { type FC, type ReactNode, useCallback, useMemo } from "react";

import { Outlet } from "@tanstack/react-router";

import MainLayout from "@/layouts/main/MainLayout";

import CreateFunctionModal from "@/pages/functions/components/create/CreateFunctionModal";
import InvocationDrawer from "@/pages/invocations/components/drawer/InvocationDrawer";

import { GALAXY_DEFAULT_PRODUCT_URLS } from "@/module/constants";
import {
  useAlchemyLayoutSearch,
  useAlchemyNavigate,
  useAlchemyReturn,
  useAlchemySearchUpdate,
} from "@/module/hooks";
import { AlchemyPath, type AlchemyReturnSearch, createAlchemyFlowSearch } from "@/module/paths";
import type { AlchemyLayoutSearch } from "@/module/schemas";
import { Flow, type GalaxyProductUrls } from "@/module/types";
import { getGalaxyProductOrigins, resolveAlchemyReturnUrl } from "@/module/utils";

export interface AlchemyLayoutProps {
  sidebarFooter?: ReactNode;
  productUrls?: GalaxyProductUrls;
}

const AlchemyLayout: FC<AlchemyLayoutProps> = ({
  sidebarFooter,
  productUrls = GALAXY_DEFAULT_PRODUCT_URLS,
}) => {
  const updateSearch = useAlchemySearchUpdate<AlchemyLayoutSearch>();
  const navigate = useAlchemyNavigate();
  const returnToCaller = useAlchemyReturn();
  const {
    flow,
    functionId,
    functionName,
    functionDescription,
    runtime,
    contract,
    returnTo,
    returnLabel,
    invocationId,
    invocationAttempt,
  } = useAlchemyLayoutSearch();

  const returnUrl = useMemo(() => {
    if (!returnTo) return undefined;
    const { origin } = window.location;
    return resolveAlchemyReturnUrl(returnTo, origin, getGalaxyProductOrigins(productUrls, origin));
  }, [returnTo, productUrls]);

  const handleCloseDrawer = useCallback(() => {
    void updateSearch(
      (prev) => {
        const { invocationId: _, invocationAttempt: __, ...rest } = prev;
        return rest;
      },
      { replace: true },
    );
  }, [updateSearch]);

  const handleAttemptChange = useCallback(
    (attempt: number) => {
      void updateSearch((prev) => ({ ...prev, invocationAttempt: attempt }), { replace: true });
    },
    [updateSearch],
  );

  const closeFlow = useCallback(() => {
    void updateSearch((prev) => ({ ...prev, ...createAlchemyFlowSearch() }), { replace: true });
  }, [updateSearch]);

  const handleCloseFlow = useCallback(() => {
    if (returnUrl) {
      returnToCaller(returnUrl);
      return;
    }
    closeFlow();
  }, [closeFlow, returnUrl, returnToCaller]);

  const handleFunctionCreated = useCallback(
    (result: AlchemyReturnSearch) => {
      if (returnUrl) {
        returnToCaller(returnUrl, result);
        return;
      }
      closeFlow();
      void navigate({
        to: AlchemyPath.FUNCTION_VERSIONS,
        params: { id: result.alchemyFunctionId },
        search: { version: result.alchemyFunctionVersion },
      });
    },
    [closeFlow, navigate, returnUrl, returnToCaller],
  );

  return (
    <>
      <MainLayout sidebarFooter={sidebarFooter}>
        <Outlet />
      </MainLayout>
      <InvocationDrawer
        invocationId={invocationId}
        attempt={invocationAttempt}
        isOpen={!!invocationId}
        onClose={handleCloseDrawer}
        onAttemptChange={handleAttemptChange}
      />
      <CreateFunctionModal
        isOpen={
          flow === Flow.CREATE_FUNCTION || (flow === Flow.CREATE_FUNCTION_VERSION && !!functionId)
        }
        functionId={flow === Flow.CREATE_FUNCTION_VERSION ? functionId : undefined}
        flowSeed={{ functionName, functionDescription, runtime, contract, returnLabel }}
        onClose={handleCloseFlow}
        onCreated={handleFunctionCreated}
      />
    </>
  );
};

export default AlchemyLayout;
