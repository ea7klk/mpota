#!/bin/sh

set -eu

data_dir=${MPOTA_TILE_DATA_DIR:-/data}
source_file=${MPOTA_TILESET_SOURCE_FILE:-europe-latest.osm.pbf}
tile_file=${MPOTA_TILESET_FILE:-europe.mbtiles}
force_refresh=${MPOTA_TILESET_FORCE_REFRESH:-false}
source_path="${data_dir}/${source_file}"
target="${data_dir}/${tile_file}"
tmp_target="${target}.part.mbtiles"
store_dir="${data_dir}/.tilemaker-store"
manifest="${target}.manifest"
progress_pipe="${tmp_target}.progress"
progress_state="${tmp_target}.progress.state"

case "${tile_file}" in
  ""|/*|*/*|.*)
    echo "MPOTA_TILESET_FILE must be a simple file name" >&2
    exit 1
    ;;
esac

if [ -s "${target}" ] && [ "${force_refresh}" != "true" ]; then
  echo "Converted tile set already present at ${target}; leaving it unchanged."
  exit 0
fi

if [ ! -s "${source_path}" ]; then
  echo "Cannot build ${target}; source PBF is missing at ${source_path}" >&2
  exit 1
fi

rm -f "${tmp_target}" "${progress_pipe}" "${progress_state}"
rm -rf "${store_dir}"
mkdir -p "${store_dir}"
mkfifo "${progress_pipe}"
printf '0\n' > "${progress_state}"

echo "Converting ${source_path} to ${target} with tilemaker"
tilemaker --input "${source_path}" \
  --output "${tmp_target}" \
  --config /usr/src/app/resources/config-openmaptiles.json \
  --process /usr/src/app/resources/process-openmaptiles.lua \
  --store "${store_dir}" \
  --verbose >"${progress_pipe}" 2>&1 &
tilemaker_pid=$!
next_percent=5

tr '\r' '\n' < "${progress_pipe}" | while IFS= read -r progress_line; do
  percent=$(printf '%s\n' "${progress_line}" | sed -n 's/.*\([0-9][0-9]*\)%.*/\1/p')
  if [ -n "${percent}" ]; then
    while [ "${percent}" -ge "${next_percent}" ] && [ "${next_percent}" -le 100 ]; do
      echo "Tile extraction progress: ${next_percent}%"
      printf '%s\n' "${next_percent}" > "${progress_state}"
      next_percent=$((next_percent + 5))
    done
  elif [ -n "${progress_line}" ]; then
    echo "Tilemaker: ${progress_line}"
  fi
done

tilemaker_status=0
wait "${tilemaker_pid}" || tilemaker_status=$?
if [ "${tilemaker_status}" -ne 0 ]; then
  echo "Tile extraction failed with exit code ${tilemaker_status}" >&2
  rm -f "${progress_pipe}" "${progress_state}" "${tmp_target}"
  exit "${tilemaker_status}"
fi

last_percent=$(cat "${progress_state}")
if [ "${last_percent}" -lt 100 ]; then
  echo "Tile extraction progress: 100%"
fi
rm -f "${progress_pipe}" "${progress_state}"

test -s "${tmp_target}"
mv -f "${tmp_target}" "${target}"
{
  printf 'source_url=%s\n' "${MPOTA_TILESET_URL:-}"
  printf 'source_file=%s\n' "${source_file}"
  printf 'generated_at=%s\n' "$(date -u '+%Y-%m-%dT%H:%M:%SZ')"
} > "${manifest}"
rm -f "${source_path}"

echo "Converted tile set is ready at ${target}"
