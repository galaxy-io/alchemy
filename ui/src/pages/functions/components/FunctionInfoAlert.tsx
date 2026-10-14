import type { ComponentProps } from "react";

import { styled } from "@linaria/react";

import Alert, { AlertVariant } from "@galaxy-io/dls/feedback/Alert";
import { t } from "@galaxy-io/dls/theme/tokens/t";

// DLS Alert has no info tone, so this one borrows the blue role colors.
const InfoToneWrapper = styled.div`
  display: contents;

  & [class*="gx-Alert-r"] {
    background-color: ${t.color.background.blue};
    border-color: ${t.color.border.blue};
  }

  & [class*="gx-Alert-IconSlot"] {
    color: ${t.color.text.blue};
  }
`;

type FunctionInfoAlertProps = Omit<ComponentProps<typeof Alert>, "variant" | "color">;

const FunctionInfoAlert = (props: FunctionInfoAlertProps) => (
  <InfoToneWrapper>
    <Alert variant={AlertVariant.PRIMARY} {...props} />
  </InfoToneWrapper>
);

export default FunctionInfoAlert;
