#!/bin/bash
# Script to setup node.js ready for card development.
# So far this has been used inside a homeassistant core vscode devcontainer.
#
# After completing setup, use
#
# npm run start
# or
# npm run build

sudo apt update
sudo apt install -y npm
npm cache clean -f

scripts/update_package_json_version.sh
npm install -g n


