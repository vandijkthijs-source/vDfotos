#!/usr/bin/env python3
"""Reject APKs advertising processor types with incomplete native runtimes."""
import sys
import zipfile
from collections import defaultdict

required = {'libreactnative.so', 'libhermes.so', 'libexpo-modules-core.so', 'librnscreens.so'}
with zipfile.ZipFile(sys.argv[1]) as apk:
    libraries = defaultdict(set)
    for name in apk.namelist():
        if name.startswith('lib/') and name.endswith('.so'):
            _, abi, filename = name.split('/')
            libraries[abi].add(filename)
    if not libraries:
        raise SystemExit('No native runtime libraries found.')
    failures = []
    for abi, present in sorted(libraries.items()):
        missing = required - present
        print(f'{abi}: {"missing " + ", ".join(sorted(missing)) if missing else "complete"}')
        if missing:
            failures.append(abi)
    if failures:
        raise SystemExit('Incomplete native libraries: ' + ', '.join(failures))
    if 'assets/index.android.bundle' not in apk.namelist():
        raise SystemExit('Missing standalone JavaScript bundle.')
    print('Native runtime libraries and standalone bundle verified.')
