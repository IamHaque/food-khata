#!/usr/bin/env python3
"""List installed Python package licenses."""
import importlib.metadata as md


def main():
    rows = []
    for dist in md.distributions():
        name = dist.metadata.get("Name") or dist.name
        lic = (dist.metadata.get("License") or "UNKNOWN").splitlines()[0].strip()
        rows.append((name, dist.version, lic))
    for name, version, lic in sorted(rows, key=lambda r: r[0].lower()):
        print(f"{name}=={version}  {lic}")


if __name__ == "__main__":
    main()
