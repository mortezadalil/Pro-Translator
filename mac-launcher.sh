#!/bin/bash

# Set the app name for macOS
export ELECTRON_APP_NAME="Pro Translator"

# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Run electron with our custom name
"$DIR/node_modules/.bin/electron" "$DIR" --name="Pro Translator" "$@" 