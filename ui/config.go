package ui

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"strings"
)

// runtimeConfigElementID is the JSON script in index.html that carries
// Config, read by the standalone host.
const runtimeConfigElementID = "alchemy-runtime-config"

// Config is what the server tells the UI at runtime. It is written into
// index.html as JSON, so one UI build serves every deployment.
type Config struct {
	// ReturnOrigins are other apps, such as a standalone Filament, that may
	// open an Alchemy flow and get the user back when it ends. The UI's own
	// origin is always allowed.
	ReturnOrigins []string `json:"returnOrigins,omitempty"`
}

// ParseReturnOrigins reads a comma-separated list of origins such as
// https://filament.example.com and returns each the way a browser reports
// it, so the UI can compare them with URL.origin.
func ParseReturnOrigins(s string) ([]string, error) {
	var origins []string
	for raw := range strings.SplitSeq(s, ",") {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		origin, err := parseOrigin(raw)
		if err != nil {
			return nil, err
		}
		origins = append(origins, origin)
	}
	return origins, nil
}

func parseOrigin(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	isOrigin := (u.Scheme == "http" || u.Scheme == "https") &&
		u.Host != "" && u.User == nil && u.Opaque == "" &&
		(u.Path == "" || u.Path == "/") &&
		u.RawQuery == "" && !u.ForceQuery && u.Fragment == ""
	if !isOrigin {
		return "", fmt.Errorf("%q is not an origin such as https://filament.example.com", raw)
	}
	host := strings.ToLower(u.Host)
	if port := u.Port(); (u.Scheme == "http" && port == "80") || (u.Scheme == "https" && port == "443") {
		host = strings.TrimSuffix(host, ":"+port)
	}
	return u.Scheme + "://" + host, nil
}

// renderIndex writes cfg into index.html as a JSON script before </head>.
// json.Marshal escapes <, > and &, so the JSON cannot close the script.
func renderIndex(index []byte, cfg Config) ([]byte, error) {
	head := []byte("</head>")
	if !bytes.Contains(index, head) {
		return nil, errors.New("index.html has no </head> to write the runtime config before")
	}
	config, err := json.Marshal(cfg)
	if err != nil {
		return nil, err
	}
	script := fmt.Appendf(nil, `<script type="application/json" id="%s">%s</script>`, runtimeConfigElementID, config)
	return bytes.Replace(index, head, append(script, head...), 1), nil
}
