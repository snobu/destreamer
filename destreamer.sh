#!/usr/bin/env bash
NODE_VERSION=$(node --version)

if [[ $NODE_VERSION == "v8."* ]]; then
    node build/src/destreamer.js "$@"
else
    node --max-http-header-size 32768 build/src/destreamer.js "$@"
fi