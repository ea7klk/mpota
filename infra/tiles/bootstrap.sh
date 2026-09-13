#!/bin/sh

set -eu

data_dir=${MPOTA_TILE_DATA_DIR:-/data}
tile_file=${MPOTA_TILESET_FILE:-mpota.mbtiles}
tile_url=${MPOTA_TILESET_URL:-}
tile_sha256=${MPOTA_TILESET_SHA256:-}
required=${MPOTA_TILESET_REQUIRED:-false}
force_refresh=${MPOTA_TILESET_FORCE_REFRESH:-false}
target="${data_dir}/${tile_file}"
manifest="${target}.manifest"

case "${tile_file}" in
  ""|/*|*/*|.*)
    echo "MPOTA_TILESET_FILE must be a simple file name" >&2
    exit 1
    ;;
esac

mkdir -p "${data_dir}"

if [ -s "${target}" ] && [ "${force_refresh}" != "true" ]; then
  echo "Tile set already present at ${target}; leaving it unchanged."
  exit 0
fi

if [ -z "${tile_url}" ]; then
  if [ "${required}" = "true" ]; then
    echo "MPOTA_TILESET_URL is required but is not configured" >&2
    exit 1
  fi

  echo "No tile set URL configured; set MPOTA_TILESET_URL to an MBTiles artifact to bootstrap ${target}."
  exit 0
fi

tmp="${target}.part"
trap 'rm -f "${tmp}"' EXIT INT TERM

echo "Downloading MPOTA tile set from ${tile_url}"
curl --fail --location --show-error --silent \
  --retry 5 --retry-delay 5 --connect-timeout 20 \
  --output "${tmp}" "${tile_url}"
test -s "${tmp}"

if [ -n "${tile_sha256}" ]; then
  echo "${tile_sha256}  ${tmp}" | sha256sum --check --status
fi

mv -f "${tmp}" "${target}"
{
  printf 'url=%s\n' "${tile_url}"
  printf 'sha256=%s\n' "${tile_sha256}"
  printf 'downloaded_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
} > "${manifest}"

echo "Tile set is ready at ${target}"
