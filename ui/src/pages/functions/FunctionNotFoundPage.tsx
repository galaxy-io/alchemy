import type { FC } from "react";

import { ArrowLeftIcon, ImageBrokenIcon } from "@phosphor-icons/react";

import Button from "@galaxy-io/dls/buttons/Button";
import ErrorLayout from "@galaxy-io/dls/layout/ErrorLayout";

import RouterLink from "@/components/RouterLink";

import { AlchemyPath, createAlchemyHref } from "@/module/paths";

const FunctionNotFoundPage: FC = () => (
  <ErrorLayout
    icon={ImageBrokenIcon}
    header="Image not found"
    description="The image you are looking for does not exist"
    actions={
      <Button
        label="Go back to images"
        icon={ArrowLeftIcon}
        href={createAlchemyHref(AlchemyPath.FUNCTIONS)}
        as={RouterLink}
      />
    }
  />
);

export default FunctionNotFoundPage;
