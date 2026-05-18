"""Unit tests for the build configuration extractor."""

import json
import tempfile
from pathlib import Path

import pytest

from config_extractor.compile_commands_parser import parse_compile_commands
from config_extractor.merge import merge_per_tu_defines
from config_extractor.makefile_parser import parse_makefile_dry_run


def test_compile_commands_parser_basic(tmp_path):
    cc = [
        {"file": "/src/foo.cpp", "command": "clang++ -DFOO=1 -DBAR -c /src/foo.cpp -o foo.o"},
        {"file": "/src/bar.cpp", "command": "clang++ -DBAZ -c /src/bar.cpp -o bar.o"},
    ]
    p = tmp_path / "compile_commands.json"
    p.write_text(json.dumps(cc))

    result = parse_compile_commands(p)
    assert len(result) == 2
    assert "FOO=1" in result[0]["defines"]
    assert "BAR" in result[0]["defines"]
    assert "BAZ" in result[1]["defines"]


def test_compile_commands_parser_arguments_form(tmp_path):
    cc = [{"file": "/src/a.c", "arguments": ["clang", "-DMYDEF", "-c", "/src/a.c"]}]
    p = tmp_path / "compile_commands.json"
    p.write_text(json.dumps(cc))
    result = parse_compile_commands(p)
    assert "MYDEF" in result[0]["defines"]


def test_merge_per_tu_defines_groups_by_dir():
    per_tu = [
        {"file": "/src/lib/foo.cpp", "defines": ["A", "B"]},
        {"file": "/src/lib/bar.cpp", "defines": ["B", "C"]},
        {"file": "/src/main/main.cpp", "defines": ["D"]},
    ]
    manifest = merge_per_tu_defines(per_tu)
    targets = {t["name"]: t for t in manifest["targets"]}

    lib_defs = set(targets["/src/lib"]["compile_definitions"])
    assert lib_defs == {"A", "B", "C"}
    assert "D" in targets["/src/main"]["compile_definitions"]
    assert set(manifest["global_definitions"]) == {"A", "B", "C", "D"}


def test_extract_returns_empty_for_unknown_dir(tmp_path):
    from config_extractor.extract import extract
    result = extract(tmp_path)
    assert result == {"targets": [], "global_definitions": []}
