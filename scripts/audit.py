#!/usr/bin/env python3
"""Audit gate (DEC-P9): fail only on high/critical findings that have a fix.

Parses `pip-audit` JSON and `npm audit --omit=dev --json`. Unfixed or
non-high findings print as warnings. Allowlist entries (advisory ID, reason,
expiry) permit exceptions; an expired entry fails the build.
"""
import argparse
import json
import sys
from datetime import date, datetime
from pathlib import Path

HIGH = {"high", "critical"}


def load_json(path):
    if path == "-":
        return json.load(sys.stdin)
    with open(path, encoding="utf-8") as fh:
        return json.load(fh)


def parse_pip(data):
    findings = []
    for dep in (data.get("dependencies") or []):
        for v in (dep.get("vulns") or []):
            ids = [v.get("id")] + list(v.get("aliases") or [])
            ids = [x for x in ids if x]
            fix_versions = v.get("fix_versions") or []
            sev = (v.get("severity") or "").lower()
            if sev == "":
                sev = "high"  # pip-audit has no severity field
            findings.append({
                "ecosystem": "pip",
                "package": dep.get("name"),
                "version": dep.get("version"),
                "id": v.get("id"),
                "ids": ids,
                "severity": sev,
                "has_fix": len(fix_versions) > 0,
                "high_critical": sev in HIGH,
            })
    return findings


def _npm_ids(v):
    ids = []
    for via in (v.get("via") or []):
        if isinstance(via, dict):
            url = via.get("url") or ""
            for token in url.replace("?", "/").split("/"):
                if token.startswith("GHSA-"):
                    ids.append(token)
            if via.get("source") is not None:
                ids.append(str(via.get("source")))
            if via.get("id"):
                ids.append(via.get("id"))
    if v.get("id"):
        ids.append(v.get("id"))
    # de-dupe preserving order
    seen = set()
    out = []
    for x in ids:
        if x not in seen:
            seen.add(x)
            out.append(x)
    return out


def parse_npm(data):
    findings = []
    for name, v in (data.get("vulnerabilities") or {}).items():
        sev = (v.get("severity") or "").lower()
        fix_available = v.get("fixAvailable", False)
        findings.append({
            "ecosystem": "npm",
            "package": name,
            "version": v.get("range"),
            "id": None,
            "ids": _npm_ids(v),
            "severity": sev,
            "has_fix": fix_available is not False,
            "high_critical": sev in HIGH,
        })
    return findings


def load_allowlist(path):
    if not path:
        return []
    p = Path(path)
    if not p.exists():
        return []
    with open(p, encoding="utf-8") as fh:
        return json.load(fh)


def _expired(e, today):
    exp = e.get("expiry")
    try:
        d = datetime.strptime(str(exp), "%Y-%m-%d").date()
    except (TypeError, ValueError):
        return True
    return d < today


def expired_entries(allowlist, today=None):
    today = today or date.today()
    return [e for e in (allowlist or []) if _expired(e, today)]


def is_allowed(finding, allowlist, today=None):
    today = today or date.today()
    ids = set(finding.get("ids") or [])
    if finding.get("id"):
        ids.add(finding.get("id"))
    for e in (allowlist or []):
        if e.get("id") in ids and not _expired(e, today):
            return True
    return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--pip-audit", dest="pip_file")
    ap.add_argument("--npm-audit", dest="npm_file")
    ap.add_argument("--allowlist", dest="allowlist",
                    default=str(Path(__file__).resolve().parent / "audit-allowlist.json"))
    args = ap.parse_args()

    findings = []

    if args.pip_file:
        findings += parse_pip(load_json(args.pip_file))

    if args.npm_file:
        findings += parse_npm(load_json(args.npm_file))

    allowlist = load_allowlist(args.allowlist)
    expired = expired_entries(allowlist)

    failing = []
    warnings = []
    for f in findings:
        allowed = is_allowed(f, allowlist)
        f["allowed"] = allowed
        if f["high_critical"] and f["has_fix"] and not allowed:
            failing.append(f)
        else:
            warnings.append(f)

    if expired:
        failing.append({"ecosystem": "allowlist", "package": None, "id": None,
                        "severity": "high", "has_fix": True, "high_critical": True,
                        "allowed": False, "expired": True})

    print(f"audit: {len(failing)} failing, {len(warnings)} warnings")
    for f in failing:
        if f.get("expired"):
            for e in expired:
                print(f"FAIL [allowlist] expired entry {e.get('id')} (expiry {e.get('expiry')})")
        else:
            print(f"FAIL [{f['ecosystem']}] {f.get('package')} {f.get('id')} "
                  f"severity={f['severity']}")
    for f in warnings:
        tag = " (allowed)" if f.get("allowed") else ""
        print(f"WARN [{f['ecosystem']}] {f.get('package')} {f.get('id')} "
              f"severity={f['severity']} fix={f['has_fix']}{tag}")

    sys.exit(1 if failing else 0)


if __name__ == "__main__":
    main()
