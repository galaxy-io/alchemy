import type { DescMessage, MessageInitShape } from "@bufbuild/protobuf";

import type { PaginationRequestSchema, PaginationResponse } from "@/gen/functions/v1/pagination_pb";

import type { ListSearchParams } from "@/module/schemas";

const DEFAULT_PAGE_SIZE = 25;
const MAX_LIST_SEARCH_LENGTH = 256;

export const INITIAL_PAGE_PARAM: MessageInitShape<typeof PaginationRequestSchema> = {
  pageSize: DEFAULT_PAGE_SIZE,
};

export const getNextPageParam = (lastPage: { pagination?: PaginationResponse }) => {
  return lastPage.pagination?.nextCursor
    ? {
        pageSize: DEFAULT_PAGE_SIZE,
        cursor: lastPage.pagination.nextCursor,
      }
    : undefined;
};

export type InfiniteQueryInput<I extends DescMessage> = Omit<
  MessageInitShape<I>,
  "pagination" | "$typeName"
>;

export const createListSearchInput = ({ q }: ListSearchParams) => ({
  search: q?.trim().slice(0, MAX_LIST_SEARCH_LENGTH) ?? "",
});
