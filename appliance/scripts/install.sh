#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)
SOURCE_ROOT=$(CDPATH='' cd -- "${SCRIPT_DIR}/.." && pwd)
INSTALL_ROOT=${SUPERSET_LOCAL_HOME:-${HOME}/.superset-local-appliance}

if ! command -v node >/dev/null 2>&1; then
	echo "superset-local requires Node.js 20 or newer" >&2
	exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
if [ "${NODE_MAJOR}" -lt 20 ]; then
	echo "superset-local requires Node.js 20 or newer" >&2
	exit 1
fi

INSTALL_VERSION=$(node -e 'console.log(require(process.argv[1]).version)' "${SOURCE_ROOT}/package.json")
VERSION_ROOT=${INSTALL_ROOT}/versions/${INSTALL_VERSION}
BIN_ROOT=${INSTALL_ROOT}/bin

mkdir -p "${VERSION_ROOT}" "${BIN_ROOT}"
for entry in assets bin docs integration scripts src LICENSE.md MODIFICATIONS.md README.md package.json; do
	cp -R "${SOURCE_ROOT}/${entry}" "${VERSION_ROOT}/"
done
chmod 755 "${VERSION_ROOT}/bin/superset-local.js"
ln -sfn "${VERSION_ROOT}/bin/superset-local.js" "${BIN_ROOT}/superset-local"

echo "Installed superset-local ${INSTALL_VERSION} in ${VERSION_ROOT}"
echo "Add ${BIN_ROOT} to PATH, then run: superset-local init"
