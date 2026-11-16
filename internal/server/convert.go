package server

import (
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"google.golang.org/protobuf/encoding/protojson"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	"github.com/galaxy-io/alchemy/datastore/postgres/sqlcgen"
)

// Row to proto conversions. Timestamps become epoch millis, nullable columns
// become zero values.

func functionProto(f *sqlcgen.Function, current *sqlcgen.FunctionVersion, versions []*sqlcgen.FunctionVersion) *functionsv1.Function {
	out := &functionsv1.Function{
		TenantId:        f.TenantID,
		Id:              f.ID,
		Name:            f.Name,
		Description:     f.Description,
		CreatedAt:       stamp(f.CreatedAt),
		UpdatedAt:       stamp(f.UpdatedAt),
		CreatedByUserId: f.CreatedByUserID.String,
		UpdatedByUserId: f.UpdatedByUserID.String,
		TimeoutMs:       f.TimeoutMs,
		MaxConcurrency:  f.MaxConcurrency,
		Resources:       functionResources(f),
		Retries:         f.Retries,
		Network:         functionsv1.Network(f.Network),
	}
	if current != nil {
		out.CurrentVersion = versionProto(current)
	}
	for _, v := range versions {
		out.Versions = append(out.Versions, versionProto(v))
	}
	return out
}

func versionProto(v *sqlcgen.FunctionVersion) *functionsv1.FunctionVersion {
	spec, _ := decodeSpec(v.Spec)
	return &functionsv1.FunctionVersion{
		Id:              v.ID,
		Version:         v.Version,
		CreatedAt:       stamp(v.CreatedAt),
		Spec:            spec,
		Status:          versionStatusProto(v.Status),
		StatusMessage:   v.StatusMessage,
		ImageDigest:     v.ImageDigest,
		BuildStartedAt:  stamp(v.BuildStartedAt),
		BuildEndedAt:    stamp(v.BuildEndedAt),
		RootfsBytes:     v.RootfsBytes,
		BuildLog:        v.BuildLog,
		CreatedByUserId: v.CreatedByUserID.String,
	}
}

func invocationProto(i *sqlcgen.Invocation) *functionsv1.Invocation {
	out := &functionsv1.Invocation{
		TenantId:        i.TenantID,
		Id:              i.ID,
		FunctionId:      i.FunctionID,
		Version:         i.Version,
		Status:          invocationStatusProto(i.Status),
		StartKind:       startKindProto(i.StartKind),
		CreatedAt:       stamp(i.CreatedAt),
		StartedAt:       stamp(i.StartedAt),
		EndedAt:         stamp(i.EndedAt),
		PlatformError:   i.PlatformError,
		InputBytes:      i.InputBytes,
		OutputBytes:     i.OutputBytes,
		InstanceId:      i.InstanceID,
		IdempotencyKey:  i.IdempotencyKey,
		Host:            i.Host,
		CreatedByUserId: i.CreatedByUserID.String,
		Attempts:        i.Attempts,
		Async:           i.Async,
	}
	if i.AcquireUs != 0 || i.RunUs != 0 || i.TotalUs != 0 {
		out.Stats = &functionsv1.InvocationStats{
			StartKind: out.StartKind,
			AcquireUs: i.AcquireUs,
			RunUs:     i.RunUs,
			TotalUs:   i.TotalUs,
		}
	}
	if len(i.Error) > 0 {
		fe := &functionsv1.FunctionError{}
		if err := protojson.Unmarshal(i.Error, fe); err == nil {
			out.Error = fe
		}
	}
	return out
}

func versionStatusProto(s sqlcgen.FunctionVersionStatus) functionsv1.FunctionVersionStatus {
	switch s {
	case sqlcgen.FunctionVersionStatusBuilding:
		return functionsv1.FunctionVersionStatus_FUNCTION_VERSION_STATUS_BUILDING
	case sqlcgen.FunctionVersionStatusReady:
		return functionsv1.FunctionVersionStatus_FUNCTION_VERSION_STATUS_READY
	case sqlcgen.FunctionVersionStatusFailed:
		return functionsv1.FunctionVersionStatus_FUNCTION_VERSION_STATUS_FAILED
	default:
		return functionsv1.FunctionVersionStatus_FUNCTION_VERSION_STATUS_UNSPECIFIED
	}
}

var invocationStatuses = map[sqlcgen.InvocationStatus]functionsv1.InvocationStatus{
	sqlcgen.InvocationStatusPending:   functionsv1.InvocationStatus_INVOCATION_STATUS_PENDING,
	sqlcgen.InvocationStatusStarting:  functionsv1.InvocationStatus_INVOCATION_STATUS_STARTING,
	sqlcgen.InvocationStatusRunning:   functionsv1.InvocationStatus_INVOCATION_STATUS_RUNNING,
	sqlcgen.InvocationStatusSucceeded: functionsv1.InvocationStatus_INVOCATION_STATUS_SUCCEEDED,
	sqlcgen.InvocationStatusFailed:    functionsv1.InvocationStatus_INVOCATION_STATUS_FAILED,
	sqlcgen.InvocationStatusErrored:   functionsv1.InvocationStatus_INVOCATION_STATUS_ERRORED,
	sqlcgen.InvocationStatusCanceled:  functionsv1.InvocationStatus_INVOCATION_STATUS_CANCELED,
	sqlcgen.InvocationStatusRejected:  functionsv1.InvocationStatus_INVOCATION_STATUS_REJECTED,
}

func invocationStatusProto(s sqlcgen.InvocationStatus) functionsv1.InvocationStatus {
	return invocationStatuses[s]
}

func invocationStatusRow(s functionsv1.InvocationStatus) (sqlcgen.InvocationStatus, bool) {
	for row, proto := range invocationStatuses {
		if proto == s {
			return row, true
		}
	}
	return "", false
}

func startKindProto(k sqlcgen.NullStartKind) functionsv1.StartKind {
	if !k.Valid {
		return functionsv1.StartKind_START_KIND_UNSPECIFIED
	}
	switch k.StartKind {
	case sqlcgen.StartKindColdBoot:
		return functionsv1.StartKind_START_KIND_COLD_BOOT
	case sqlcgen.StartKindSnapshotRestore:
		return functionsv1.StartKind_START_KIND_SNAPSHOT_RESTORE
	case sqlcgen.StartKindWarm:
		return functionsv1.StartKind_START_KIND_WARM
	default:
		return functionsv1.StartKind_START_KIND_UNSPECIFIED
	}
}

func startKindRow(k functionsv1.StartKind) sqlcgen.NullStartKind {
	switch k {
	case functionsv1.StartKind_START_KIND_COLD_BOOT:
		return sqlcgen.NullStartKind{StartKind: sqlcgen.StartKindColdBoot, Valid: true}
	case functionsv1.StartKind_START_KIND_SNAPSHOT_RESTORE:
		return sqlcgen.NullStartKind{StartKind: sqlcgen.StartKindSnapshotRestore, Valid: true}
	case functionsv1.StartKind_START_KIND_WARM:
		return sqlcgen.NullStartKind{StartKind: sqlcgen.StartKindWarm, Valid: true}
	default:
		return sqlcgen.NullStartKind{}
	}
}

func stamp(t pgtype.Timestamptz) int64 {
	if !t.Valid {
		return 0
	}
	return t.Time.UnixMilli()
}

func nullMillis(ms int64) pgtype.Timestamptz {
	if ms <= 0 {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: time.UnixMilli(ms), Valid: true}
}
