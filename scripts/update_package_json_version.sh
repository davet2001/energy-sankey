#!/bin/bash

# Script to automatically update the version number in package.json based
# on the latest git tag using `git describe`.
# Avoids rewriting package.json if there are no changes.
#
# Note that this script makes package.json a generated file, based on
# package.json.template.

PACKAGE_JSON=package.json
PACKAGE_JSON_TEMPLATE=package.json.template

version_string=`git describe --tags --dirty=* | sed 's/^v//'`
package_json_new=`jq --arg v "$version_string" '.version = $v' $PACKAGE_JSON_TEMPLATE`

if [ -f $PACKAGE_JSON ]; then
  package_json_existing=$(<$PACKAGE_JSON)
  if [[ "$package_json_new" == "$package_json_existing" ]]; then
    #echo "AutoVersion: $PACKAGE_JSON is already up to date with version: $version_string"
    exit 0
  fi
fi
echo "AutoVersion: Updating $PACKAGE_JSON with version: $version_string"
echo "${package_json_new}" > package.json


