package bus

import (
	"testing"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
	hostv1 "github.com/galaxy-io/alchemy/api/host/v1"
)

func TestRecordsMsgID(t *testing.T) {
	batch := func(status functionsv1.InvocationStatus, attempts int32) *hostv1.InvocationRecords {
		return &hostv1.InvocationRecords{Invocations: []*functionsv1.Invocation{{Id: "inv-1", Status: status, Attempts: attempts}}}
	}
	pending := recordsMsgID(InvocationsServerSubject, batch(functionsv1.InvocationStatus_INVOCATION_STATUS_PENDING, 0))
	if again := recordsMsgID(InvocationsServerSubject, batch(functionsv1.InvocationStatus_INVOCATION_STATUS_PENDING, 0)); again != pending {
		t.Fatal("the same batch published again is named differently, so a retried publish is not dropped")
	}
	// Every later record of the invocation must reach the stream.
	later := map[string]string{
		"host running":        recordsMsgID(InvocationsHostSubject, batch(functionsv1.InvocationStatus_INVOCATION_STATUS_RUNNING, 1)),
		"host retry pending":  recordsMsgID(InvocationsHostSubject, batch(functionsv1.InvocationStatus_INVOCATION_STATUS_PENDING, 1)),
		"host next running":   recordsMsgID(InvocationsHostSubject, batch(functionsv1.InvocationStatus_INVOCATION_STATUS_RUNNING, 2)),
		"host failed":         recordsMsgID(InvocationsHostSubject, batch(functionsv1.InvocationStatus_INVOCATION_STATUS_FAILED, 2)),
		"host same as server": recordsMsgID(InvocationsHostSubject, batch(functionsv1.InvocationStatus_INVOCATION_STATUS_PENDING, 0)),
	}
	seen := map[string]string{pending: "server pending"}
	for name, id := range later {
		if prev, ok := seen[id]; ok {
			t.Errorf("%s is named like %s, so the stream drops it as a duplicate", name, prev)
		}
		seen[id] = name
	}
}
