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

const BATCH_TIMEOUT = Symbol("batchTimeout");

const batchTimeout = (ms: number) =>
  new Promise<typeof BATCH_TIMEOUT>((resolve) => {
    setTimeout(() => resolve(BATCH_TIMEOUT), ms);
  });

export async function* batchIterable<T>(
  source: AsyncIterable<T>,
  intervalMs: number,
): AsyncGenerator<T[]> {
  const iterator = source[Symbol.asyncIterator]();
  let pending: Promise<IteratorResult<T>> | null = null;
  try {
    while (true) {
      const first = await (pending ?? iterator.next());
      pending = null;
      if (first.done) return;
      const batch = [first.value];
      const deadline = Date.now() + intervalMs;
      let remaining = intervalMs;
      while (remaining > 0) {
        pending = iterator.next();
        const result = await Promise.race([pending, batchTimeout(remaining)]);
        if (result === BATCH_TIMEOUT) break;
        pending = null;
        if (result.done) {
          yield batch;
          return;
        }
        batch.push(result.value);
        remaining = deadline - Date.now();
      }
      yield batch;
    }
  } finally {
    pending?.catch(() => {});
    await iterator.return?.();
  }
}
