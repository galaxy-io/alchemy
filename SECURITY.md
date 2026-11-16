# Security Policy

## Supported Versions

| Version | Supported |
| --- | --- |
| 0.x | Yes |

## Reporting a Vulnerability

Please report security vulnerabilities privately using
[GitHub private vulnerability reporting](https://github.com/galaxy-io/alchemy/security/advisories/new).
Do not open a public issue for a security concern.

Include a description of the vulnerability, steps to reproduce it, its
potential impact, and any suggested mitigation. Do not include credentials,
customer data, or other secrets unless they are necessary to reproduce the
issue and can be shared safely through the private report.

## Scope

We accept reports for vulnerabilities in code and release artifacts maintained
in this repository, including the server and API, the host, the in-VM
supervisor, the runtime images, the web UI, the Helm chart, and the published
container images.

Escaping a function's microVM, reaching another invocation's input, output,
logs or secrets, crossing from one tenant to another, and reaching the host,
the cluster or a private address from a guest with egress are in scope and are
the reports we most want.

The following are out of scope:

- Vulnerabilities solely in third-party dependencies or upstream projects,
  including Firecracker and the Linux kernel. We may update affected
  dependencies, but the underlying issue should be reported to the responsible
  upstream project.
- Issues that require an attacker to already have administrative access to the
  Alchemy deployment, its Kubernetes cluster, its nodes, PostgreSQL, NATS or
  its buckets.
- Reports that describe only a missing security hardening measure without a
  concrete security impact.

## Disclosure Process

When we receive a valid report, we will:

1. Triage the report and determine whether Alchemy is directly affected.
2. Develop and test a fix privately.
3. Coordinate CVE assignment through GitHub Security Advisories when warranted.
4. Publish an advisory and release a patched version.
5. Credit the reporter in the advisory unless they prefer to remain anonymous.

Please allow us a reasonable opportunity to investigate and address the issue
before public disclosure.
