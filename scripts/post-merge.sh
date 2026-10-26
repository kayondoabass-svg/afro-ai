#!/bin/bash
set -e
pnpm install --frozen-lockfile
# Preserve the existing database. A source-layout migration must never push
# a generated scaffold schema or force destructive schema synchronization.
