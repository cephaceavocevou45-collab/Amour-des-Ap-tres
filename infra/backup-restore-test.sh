#!/bin/sh
set -eu
node "$(dirname "$0")/backup-restore-test.cjs"
