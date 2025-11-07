#!/bin/sh
if ! p4d  -C1 -xD; then
    p4d  -C1 -xD $P4NAME
    p4d  -C1 -Gc
fi
p4d -C1