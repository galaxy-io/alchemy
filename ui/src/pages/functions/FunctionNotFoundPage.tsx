import { QuestionIcon } from "@phosphor-icons/react";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";

import RouterLink from "@/components/RouterLink";

import EmptyLayout from "@/layouts/EmptyLayout";
import PageLayout from "@/layouts/page/PageLayout";

const FunctionNotFoundPage = () => {
  return (
    <PageLayout title="Not found">
      <EmptyLayout
        icon={QuestionIcon}
        header="No such function"
        actions={
          <Button
            label="Back to images"
            variant={ButtonVariant.SECONDARY}
            href="./images"
            as={RouterLink}
          />
        }
      />
    </PageLayout>
  );
};

export default FunctionNotFoundPage;
