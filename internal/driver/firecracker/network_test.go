package firecracker

import (
	"net/netip"
	"strings"
	"testing"
)

func TestEgressSlots(t *testing.T) {
	e := &egress{subnet: netip.MustParsePrefix("169.254.200.0/29"), inUse: map[int]bool{}}
	first, err := e.take()
	if err != nil {
		t.Fatal(err)
	}
	second, err := e.take()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := e.take(); err == nil {
		t.Fatal("a /29 has two /30s, took a third")
	}
	host, ns := e.slotAddrs(second)
	if host.String() != "169.254.200.5" || ns.String() != "169.254.200.6" {
		t.Errorf("slot %d = %s, %s", second, host, ns)
	}
	e.give(first)
	if got, err := e.take(); err != nil || got != first {
		t.Errorf("take after give = %d, %v; want %d", got, err, first)
	}
}

func TestHostRulesDenyMetadataAndPrivate(t *testing.T) {
	rules := hostRules(netip.MustParsePrefix("169.254.200.0/21"), DefaultEgressDeny)
	for _, want := range []string{"169.254.0.0/16", "10.0.0.0/8", `iifname "fc*" drop`, "ip saddr 169.254.200.0/21"} {
		if !strings.Contains(rules, want) {
			t.Errorf("rules lack %q", want)
		}
	}
}

func TestEgressBootArgs(t *testing.T) {
	got := (&egress{dns: []string{"1.1.1.1"}}).bootArgs()
	if want := " ip=172.16.0.2::172.16.0.1:255.255.255.252::eth0:off:1.1.1.1:"; got != want {
		t.Errorf("bootArgs = %q, want %q", got, want)
	}
}

func TestGuestAddrs(t *testing.T) {
	if guestGateway.String() != "172.16.0.1" || guestIP.String() != "172.16.0.2" {
		t.Errorf("gateway %s, guest %s", guestGateway, guestIP)
	}
	if got := mac(guestGateway); got != "06:00:ac:10:00:01" {
		t.Errorf("tap mac = %s", got)
	}
	if got := mac(guestIP); got != "06:00:ac:10:00:02" {
		t.Errorf("guest mac = %s", got)
	}
}
