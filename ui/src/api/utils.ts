import z from "zod";

export const MAX_LIST_SEARCH_LENGTH = 256;
export const LIST_SEARCH_DEBOUNCE_MS = 300;

export const listSearchParamsSchema = z.object({
  q: z.string().optional().catch(undefined),
});

export type ListSearchParams = z.infer<typeof listSearchParamsSchema>;

export const createListSearchInput = ({ q }: ListSearchParams) => ({
  search: q?.trim().slice(0, MAX_LIST_SEARCH_LENGTH) ?? "",
});
