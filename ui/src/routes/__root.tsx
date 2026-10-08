import { styled } from "@linaria/react";
import { createRootRoute, Outlet } from "@tanstack/react-router";

import { t } from "@galaxy-io/dls/theme/tokens/t";

const RootComponentWrapper = styled.div`
  display: flex;
  flex-direction: column;

  height: 100vh;
  width: 100vw;
  background-color: ${t.color.background.base};

  ::selection {
    background-color: ${t.color.background.blue};
  }
`;

const RootComponent = () => {
  return (
    <RootComponentWrapper>
      <Outlet />
    </RootComponentWrapper>
  );
};

export const Route = createRootRoute({
  component: RootComponent,
});
