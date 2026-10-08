import { CompassIcon } from "@phosphor-icons/react";

import Button, { ButtonVariant } from "@galaxy-io/dls/buttons/Button";
import EmptyState, { EmptyStateSize } from "@galaxy-io/dls/feedback/EmptyState";
import Flex, { JustifyContent } from "@galaxy-io/dls/layout/Flex";

import RouterLink from "@/components/RouterLink";

import PageLayout from "@/layouts/page/PageLayout";

const NotFoundPage = () => {
  return (
    <PageLayout title="Not found">
      <Flex padding={48} grow={1} justifyContent={JustifyContent.CENTER}>
        <EmptyState
          size={EmptyStateSize.LARGE}
          icon={CompassIcon}
          header="There is nothing here"
          description="The page may have moved, or the link is wrong."
          actions={
            <Button
              label="Go to overview"
              variant={ButtonVariant.SECONDARY}
              href="/observability"
              as={RouterLink}
            />
          }
        />
      </Flex>
    </PageLayout>
  );
};

export default NotFoundPage;
