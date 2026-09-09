#!/usr/bin/env bash
# Stamps the release version into the Wails build assets so package metadata,
# Windows file info and the Linux .desktop entry all match the tag.
set -euo pipefail

tag="${1:?usage: set-version.sh <tag>}"
version="${tag#v}"

cd "$(dirname "$0")/../../desktop"

# The version lives under `info:` in build/config.yml, so the key is indented.
sed -i.bak -E "s|^([[:space:]]+version: )\"[^\"]*\"|\1\"${version}\"|" build/config.yml
rm -f build/config.yml.bak

if ! grep -qE "^[[:space:]]+version: \"${version}\"" build/config.yml; then
  echo "error: could not stamp version ${version} into build/config.yml" >&2
  exit 1
fi

wails3 task common:update:build-assets

# The generated assets are what actually ship, so verify one of them.
if ! grep -q "\"${version}\"" build/windows/info.json; then
  echo "error: build assets were not regenerated with version ${version}" >&2
  exit 1
fi

echo "Stamped version ${version}"
