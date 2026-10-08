package server

import (
	"encoding/base64"
	"errors"
	"math"
	"strconv"

	"connectrpc.com/connect"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
)

const (
	defaultPageSize = 50
	maxPageSize     = 200
	// allRows is the limit used when no pagination is requested.
	allRows = 10000
)

// page is the SQL window for one request.
type page struct {
	limit  int32
	offset int32
}

// pageFor turns a PaginationRequest into a SQL window. An absent request
// returns everything, up to allRows. Cursors are opaque to clients; they
// encode an offset.
func pageFor(req *functionsv1.PaginationRequest) (page, error) {
	if req == nil {
		return page{limit: allRows}, nil
	}
	size := int(req.GetPageSize())
	if size <= 0 {
		size = defaultPageSize
	}
	size = min(size, maxPageSize)

	offset := 0
	if req.Cursor != nil {
		var err error
		if offset, err = decodeCursor(req.GetCursor()); err != nil {
			return page{}, connect.NewError(connect.CodeInvalidArgument, errors.New("pagination.cursor is not valid"))
		}
	}
	return page{limit: int32(size), offset: int32(min(offset, math.MaxInt32))}, nil //nolint:gosec // bounded above
}

// response describes the page that was returned out of total rows.
func (p page) response(returned int, total int64) *functionsv1.PaginationResponse {
	resp := &functionsv1.PaginationResponse{Total: int32(min(total, math.MaxInt32))} //nolint:gosec // clamped
	if p.offset > 0 {
		resp.PreviousCursor = new(encodeCursor(max(int(p.offset)-int(p.limit), 0)))
	}
	if end := int64(p.offset) + int64(returned); end < total && p.limit != allRows {
		resp.NextCursor = new(encodeCursor(int(end)))
	}
	return resp
}

func encodeCursor(offset int) string {
	return base64.RawURLEncoding.EncodeToString([]byte(strconv.Itoa(offset)))
}

func decodeCursor(cursor string) (int, error) {
	raw, err := base64.RawURLEncoding.DecodeString(cursor)
	if err != nil {
		return 0, err
	}
	offset, err := strconv.Atoi(string(raw))
	if err != nil || offset < 0 {
		return 0, errors.New("bad offset")
	}
	return offset, nil
}
