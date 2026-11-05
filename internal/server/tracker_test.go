package server

import (
	"testing"
	"time"

	functionsv1 "github.com/galaxy-io/alchemy/api/functions/v1"
)

func TestTerminal(t *testing.T) {
	for status := range functionsv1.InvocationStatus_name {
		s := functionsv1.InvocationStatus(status)
		want := true
		switch s {
		case functionsv1.InvocationStatus_INVOCATION_STATUS_UNSPECIFIED,
			functionsv1.InvocationStatus_INVOCATION_STATUS_PENDING,
			functionsv1.InvocationStatus_INVOCATION_STATUS_STARTING,
			functionsv1.InvocationStatus_INVOCATION_STATUS_RUNNING:
			want = false
		}
		if got := terminal(s); got != want {
			t.Errorf("terminal(%v) = %v, want %v", s, got, want)
		}
	}
}

func TestTrackerLifecycle(t *testing.T) {
	tr := newTracker()
	tr.put(&functionsv1.Invocation{Id: "a", Status: functionsv1.InvocationStatus_INVOCATION_STATUS_PENDING})

	got := tr.update("a", func(inv *functionsv1.Invocation) {
		inv.Status = functionsv1.InvocationStatus_INVOCATION_STATUS_RUNNING
	})
	if got.GetStatus() != functionsv1.InvocationStatus_INVOCATION_STATUS_RUNNING {
		t.Fatalf("status = %v, want RUNNING", got.GetStatus())
	}
	// update hands back a copy: changing it changes nothing tracked.
	got.Status = functionsv1.InvocationStatus_INVOCATION_STATUS_FAILED
	if s := tr.get("a").GetStatus(); s != functionsv1.InvocationStatus_INVOCATION_STATUS_RUNNING {
		t.Fatalf("tracked status = %v after changing the copy", s)
	}

	tr.update("a", func(inv *functionsv1.Invocation) {
		inv.Status = functionsv1.InvocationStatus_INVOCATION_STATUS_SUCCEEDED
	})
	if _, active := tr.active["a"]; active {
		t.Fatal("ended invocation still active")
	}
	if tr.get("a") == nil {
		t.Fatal("ended invocation not kept as recent")
	}
	// An ended invocation takes no more updates, so a late host event
	// cannot reopen it.
	if tr.update("a", func(*functionsv1.Invocation) { t.Error("updated an ended invocation") }) != nil {
		t.Error("update of an ended invocation returned it")
	}

	tr.forget(time.Now())
	if tr.get("a") == nil {
		t.Fatal("recent invocation forgotten before recentFor")
	}
	tr.forget(time.Now().Add(recentFor + time.Second))
	if tr.get("a") != nil {
		t.Fatal("recent invocation kept past recentFor")
	}
}

func TestTrackerUnknownAndDropped(t *testing.T) {
	tr := newTracker()
	if tr.update("missing", func(*functionsv1.Invocation) { t.Error("fn ran for an unknown id") }) != nil {
		t.Error("update of an unknown id returned something")
	}
	tr.put(&functionsv1.Invocation{Id: "b"})
	tr.drop("b")
	if tr.get("b") != nil || len(tr.list()) != 0 {
		t.Error("dropped invocation still tracked")
	}
}
