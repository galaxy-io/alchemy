package firecracker

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"net"
	"net/netip"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
)

// A microVM with egress gets a network namespace of its own, which the
// jailer runs Firecracker in. Inside it every microVM looks the same: tap0
// with a fixed MAC and address, and the guest at a fixed address behind it,
// so a snapshot restores into any namespace unchanged. A veth pair with an
// address unique on the host links the namespace to the host, which drops
// what the guest must not reach and masquerades the rest out of the pod.

const (
	netnsDir    = "/var/run/netns"
	netnsPrefix = "fc-"
	// hostIfPrefix starts every host-side veth, which the host's rules match.
	hostIfPrefix = "fc"
	tapName      = "tap0"
	// nsIfName is the namespace end of the veth.
	nsIfName    = "veth0"
	guestIfName = "eth0"
	ipForward   = "/proc/sys/net/ipv4/ip_forward"
	ipv4Bits    = 32
	// macPrefix makes a locally administered unicast MAC.
	macPrefix = "06:00"
	// slotBits sizes each veth pair's slice of the subnet, one address per end.
	slotBits = 30
	// maxIfName is IFNAMSIZ less the terminating NUL.
	maxIfName = 15
	// maxDNS is how many servers the kernel's ip= argument takes.
	maxDNS = 2
)

// guestNet is the /30 inside every namespace: tap0 first, the guest second.
var (
	guestNet     = netip.MustParsePrefix("172.16.0.0/30")
	guestGateway = guestNet.Addr().Next()
	guestIP      = guestGateway.Next()
)

// DefaultEgressDeny is what a guest can never reach: private, shared,
// loopback, link-local (and so cloud metadata), reserved and multicast.
var DefaultEgressDeny = []string{
	"0.0.0.0/8", "10.0.0.0/8", "100.64.0.0/10", "127.0.0.0/8", "169.254.0.0/16",
	"172.16.0.0/12", "192.0.0.0/24", "192.168.0.0/16", "198.18.0.0/15",
	"224.0.0.0/4", "240.0.0.0/4",
}

// egress hands each microVM with egress a /30 of subnet for its veth pair.
type egress struct {
	subnet netip.Prefix
	dns    []string
	mu     sync.Mutex
	next   int
	inUse  map[int]bool
}

// vmNet is one microVM's namespace and the /30 it holds.
type vmNet struct {
	ns   string
	slot int
}

// setupEgress checks the configuration, turns on forwarding, loads the
// host's rules and removes namespaces a previous run left.
func setupEgress(ctx context.Context, cfg Config) (*egress, error) {
	subnet, err := netip.ParsePrefix(cfg.EgressSubnet)
	if err != nil || !subnet.Addr().Is4() || subnet.Bits() > slotBits {
		return nil, fmt.Errorf("egress subnet %q is not an IPv4 prefix of /%d or wider", cfg.EgressSubnet, slotBits)
	}
	deny := append(append([]string{}, DefaultEgressDeny...), cfg.EgressDeny...)
	denied := make([]netip.Prefix, 0, len(deny))
	for _, d := range deny {
		p, err := netip.ParsePrefix(d)
		if err != nil {
			return nil, fmt.Errorf("egress deny %q: %w", d, err)
		}
		denied = append(denied, p)
	}
	for _, s := range cfg.EgressDNS {
		ip, err := netip.ParseAddr(s)
		if err != nil || !ip.Is4() {
			return nil, fmt.Errorf("egress dns %q is not an IPv4 address", s)
		}
		for _, p := range denied {
			if p.Contains(ip) {
				return nil, fmt.Errorf("egress dns %s is in the deny list (%s), so guests could not reach it", s, p)
			}
		}
	}
	if len(cfg.EgressDNS) == 0 || len(cfg.EgressDNS) > maxDNS {
		return nil, fmt.Errorf("egress needs one to %d dns servers", maxDNS)
	}
	if err := os.WriteFile(ipForward, []byte("1"), 0); err != nil {
		return nil, fmt.Errorf("enable forwarding: %w", err)
	}
	if err := run(ctx, strings.NewReader(hostRules(subnet, deny)), "nft", "-f", "-"); err != nil {
		return nil, err
	}
	entries, _ := os.ReadDir(netnsDir)
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), netnsPrefix) {
			_ = run(ctx, nil, "ip", "netns", "del", e.Name())
		}
	}
	return &egress{subnet: subnet, dns: cfg.EgressDNS, inUse: make(map[int]bool)}, nil
}

// hostRules drops traffic from guests to the host itself and to deny,
// keeps connections into guests to replies, and masquerades the rest.
func hostRules(subnet netip.Prefix, deny []string) string {
	return fmt.Sprintf(`table inet alchemy_egress {}
delete table inet alchemy_egress
table inet alchemy_egress {
	set deny {
		type ipv4_addr; flags interval; auto-merge
		elements = { %s }
	}
	chain input {
		type filter hook input priority 0; policy accept
		iifname "%[2]s*" drop
	}
	chain forward {
		type filter hook forward priority 0; policy accept
		iifname "%[2]s*" meta nfproto ipv6 drop
		iifname "%[2]s*" ip daddr @deny drop
		oifname "%[2]s*" ct state established,related accept
		oifname "%[2]s*" drop
	}
	chain postrouting {
		type nat hook postrouting priority srcnat; policy accept
		ip saddr %[3]s oifname != "%[2]s*" masquerade
	}
}
`, strings.Join(deny, ", "), hostIfPrefix, subnet)
}

// slotAddrs are the host and namespace ends of slot's /30.
func (e *egress) slotAddrs(slot int) (host, ns netip.Addr) {
	base := e.subnet.Masked().Addr().As4()
	var b [4]byte
	binary.BigEndian.PutUint32(b[:], binary.BigEndian.Uint32(base[:])+uint32(slot)<<(ipv4Bits-slotBits)) //nolint:gosec // slot is bounded by the subnet size
	host = netip.AddrFrom4(b).Next()
	return host, host.Next()
}

func (e *egress) take() (int, error) {
	e.mu.Lock()
	defer e.mu.Unlock()
	slots := 1 << (slotBits - e.subnet.Bits())
	for range slots {
		slot := e.next
		e.next = (e.next + 1) % slots
		if !e.inUse[slot] {
			e.inUse[slot] = true
			return slot, nil
		}
	}
	return 0, fmt.Errorf("all %d egress addresses in %s are in use", slots, e.subnet)
}

func (e *egress) give(slot int) {
	e.mu.Lock()
	defer e.mu.Unlock()
	delete(e.inUse, slot)
}

// bootArgs has the guest kernel bring up eth0 and list the dns servers in
// /proc/net/pnp, which the supervisor uses as resolv.conf.
func (e *egress) bootArgs() string {
	dns := append(append([]string{}, e.dns...), "")[:maxDNS]
	mask := net.IP(net.CIDRMask(guestNet.Bits(), ipv4Bits))
	return fmt.Sprintf(" ip=%s::%s:%s::%s:off:%s", guestIP, guestGateway, mask, guestIfName, strings.Join(dns, ":"))
}

// add makes id's namespace with the tap Firecracker, running as uid, opens.
func (e *egress) add(ctx context.Context, id string, uid int) (*vmNet, error) {
	slot, err := e.take()
	if err != nil {
		return nil, err
	}
	n := &vmNet{ns: netnsPrefix + id, slot: slot}
	hostIf := hostIfPrefix + id[:min(len(id), maxIfName-len(hostIfPrefix))]
	hostAddr, nsAddr := e.slotAddrs(slot)
	u := strconv.Itoa(uid)
	steps := [][]string{
		{"netns", "add", n.ns},
		{"link", "add", hostIf, "type", "veth", "peer", "name", nsIfName, "netns", n.ns},
		{"addr", "add", netip.PrefixFrom(hostAddr, slotBits).String(), "dev", hostIf},
		{"link", "set", hostIf, "up"},
		{"-n", n.ns, "link", "set", "lo", "up"},
		{"-n", n.ns, "addr", "add", netip.PrefixFrom(nsAddr, slotBits).String(), "dev", nsIfName},
		{"-n", n.ns, "link", "set", nsIfName, "up"},
		{"-n", n.ns, "route", "add", "default", "via", hostAddr.String()},
		{"-n", n.ns, "tuntap", "add", "dev", tapName, "mode", "tap", "user", u, "group", u},
		{"-n", n.ns, "link", "set", tapName, "address", mac(guestGateway)},
		{"-n", n.ns, "addr", "add", netip.PrefixFrom(guestGateway, guestNet.Bits()).String(), "dev", tapName},
		{"-n", n.ns, "link", "set", tapName, "up"},
	}
	for _, args := range steps {
		if err = run(ctx, nil, "ip", args...); err != nil {
			break
		}
	}
	// The guest's fixed address leaves the namespace as the veth's.
	if err == nil {
		err = run(ctx, strings.NewReader(nsRules), "ip", "netns", "exec", n.ns, "nft", "-f", "-")
	}
	if err == nil {
		err = run(ctx, nil, "ip", "netns", "exec", n.ns, "sh", "-c", "echo 1 > "+ipForward)
	}
	if err != nil {
		e.del(context.WithoutCancel(ctx), n)
		return nil, err
	}
	return n, nil
}

const nsRules = `table ip alchemy {
	chain postrouting {
		type nat hook postrouting priority srcnat; policy accept
		oifname "` + nsIfName + `" masquerade
	}
}
`

// del removes n's namespace, which takes the tap and both veth ends with
// it, and frees its /30.
func (e *egress) del(ctx context.Context, n *vmNet) {
	if _, err := os.Stat(filepath.Join(netnsDir, n.ns)); err == nil {
		_ = run(ctx, nil, "ip", "netns", "del", n.ns)
	}
	e.give(n.slot)
}

// mac is a locally administered unicast MAC holding addr, so it is the same
// in every namespace and a restored guest's ARP cache stays right.
func mac(addr netip.Addr) string {
	b := addr.As4()
	return fmt.Sprintf("%s:%02x:%02x:%02x:%02x", macPrefix, b[0], b[1], b[2], b[3])
}

// path is the namespace file the jailer joins.
func (n *vmNet) path() string { return filepath.Join(netnsDir, n.ns) }

func run(ctx context.Context, stdin *strings.Reader, name string, args ...string) error {
	cmd := exec.CommandContext(ctx, name, args...) //nolint:gosec // fixed ip and nft invocations
	if stdin != nil {
		cmd.Stdin = stdin
	}
	var out bytes.Buffer
	cmd.Stdout, cmd.Stderr = &out, &out
	if err := cmd.Run(); err != nil {
		return fmt.Errorf("%s %s: %w: %s", name, strings.Join(args, " "), err, strings.TrimSpace(out.String()))
	}
	return nil
}
