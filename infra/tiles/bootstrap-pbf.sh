#!/bin/sh

set -eu

data_dir=${MPOTA_TILE_DATA_DIR:-/data}
source_file=${MPOTA_TILESET_SOURCE_FILE:-europe-latest.osm.pbf}
source_url=${MPOTA_TILESET_URL:-}
source_sha256=${MPOTA_TILESET_SHA256:-}
required=${MPOTA_TILESET_REQUIRED:-false}
force_refresh=${MPOTA_TILESET_FORCE_REFRESH:-false}
source_path="${data_dir}/${source_file}"

case "${source_file}" in
  ""|/*|*/*|.*)
    echo "MPOTA_TILESET_SOURCE_FILE must be a simple file name" >&2
    exit 1
    ;;
esac

mkdir -p "${data_dir}"

if [ "${force_refresh}" != "true" ] && [ -s "${data_dir}/${MPOTA_TILESET_FILE:-europe.mbtiles}" ]; then
  echo "Converted tile set already present; skipping PBF download."
  exit 0
fi

if [ -s "${source_path}" ] && [ "${force_refresh}" != "true" ]; then
  echo "Europe PBF already present at ${source_path}; leaving it unchanged."
  exit 0
fi

if [ -z "${source_url}" ]; then
  if [ "${required}" = "true" ]; then
    echo "MPOTA_TILESET_URL is required but is not configured" >&2
    exit 1
  fi

  echo "No PBF source URL configured; set MPOTA_TILESET_URL to bootstrap ${source_path}."
  exit 0
fi

tmp="${source_path}.part"
progress_pipe="${tmp}.progress"
trap 'rm -f "${tmp}" "${progress_pipe}"' EXIT INT TERM

rm -f "${progress_pipe}"
mkfifo "${progress_pipe}"

echo "Downloading Europe OSM PBF from ${source_url}"
curl --fail --location --show-error --progress-bar \
  --retry 5 --retry-delay 5 --connect-timeout 20 \
  --output "${tmp}" "${source_url}" 2>"${progress_pipe}" &
curl_pid=$!
next_percent=5

tr '\r' '\n' < "${progress_pipe}" | while IFS= read -r progress_line; do
  percent=$(printf '%s\n' "${progress_line}" | sed -n 's/.* \([0-9][0-9]*\)\.[0-9][0-9]*%.*/\1/p')
  if [ -n "${percent}" ]; then
    while [ "${percent}" -ge "${next_percent}" ] && [ "${next_percent}" -le 100 ]; do
      echo "Europe PBF download progress: ${next_percent}%"
      next_percent=$((next_percent + 5))
    done
  elif [ -n "${progress_line}" ]; then
    echo "Europe PBF download: ${progress_line}"
  fi
done

curl_status=0
wait "${curl_pid}" || curl_status=$?
if [ "${curl_status}" -ne 0 ]; then
  echo "Europe PBF download failed with exit code ${curl_status}" >&2
  exit "${curl_status}"
fi
test -s "${tmp}"

if [ -n "${source_sha256}" ]; then
  echo "${source_sha256}  ${tmp}" | sha256sum --check --status
fi

mv -f "${tmp}" "${source_path}"
echo "Europe PBF is ready at ${source_path}"
