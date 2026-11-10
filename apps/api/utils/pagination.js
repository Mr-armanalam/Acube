// Phase 3b: shared pagination for every list endpoint.
//
// Shape (breaking change from the old bare arrays — see PHASE3B_NOTES.md):
//   { items, page, limit, total, totalPages }
// `page` is 1-based, `limit` is capped at MAX_PAGE_LIMIT by the Zod
// schema (middleware/validate.js validateQuery). Lists are sorted by
// createdAt ascending unless the caller passes its own sort — that
// preserves the old insertion order the clients display.
import { DEFAULT_PAGE_LIMIT } from "@acube/shared";

/** Read the validated pagination off req (set by validateQuery). */
export function paginationOf(req) {
  const page = req.pagination?.page ?? 1;
  const limit = req.pagination?.limit ?? DEFAULT_PAGE_LIMIT;
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Run a paginated Mongoose query. `query` is a Mongoose Query (already
 * filtered/sorted); `countQuery` defaults to the same filter via
 * `query.model.countDocuments(query.getFilter())`.
 */
export async function paginate(query, { page, limit, skip }) {
  const [items, total] = await Promise.all([
    query.skip(skip).limit(limit).lean().exec(),
    query.model.countDocuments(query.getFilter()).exec(),
  ]);
  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/** Paginate an already-fetched in-memory array (e.g. user.downloads). */
export function paginateArray(all, { page, limit, skip }) {
  const total = all.length;
  return {
    items: all.slice(skip, skip + limit),
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}
