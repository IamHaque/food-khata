"""Environment variables for every flag (FOOD_KHATA_<NAME>); an explicit flag always wins."""

import argparse
import os

SECRET_HINTS = ("key", "secret", "token", "password", "code")


def apply_env_defaults(parser: argparse.ArgumentParser, environ=os.environ) -> None:
    for action in parser._actions:
        if not action.option_strings or action.dest == "help":
            continue
        raw = environ.get(f"FOOD_KHATA_{action.dest.upper()}")
        if raw is None:
            continue
        convert = action.type or str
        if isinstance(action, argparse._StoreTrueAction):
            value = raw.strip().lower() in {"1", "true", "yes", "on"}
        elif isinstance(action, argparse._AppendAction):
            value = [convert(v) for v in raw.split(",") if v]
        else:
            value = convert(raw)
        parser.set_defaults(**{action.dest: value})


def describe(args: argparse.Namespace) -> str:
    """The effective values, one per line, with secret-looking settings hidden."""
    lines = []
    for name, value in sorted(vars(args).items()):
        shown = "(hidden)" if value and any(h in name for h in SECRET_HINTS) else value
        lines.append(f"{name} = {shown}")
    return "\n".join(lines)
