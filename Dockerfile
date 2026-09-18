# Pinned to a specific patch: the floating `node:22-slim` tag shipped Node 22.23.0,
# whose http.Agent regression (https://github.com/nodejs/node/issues/63989) breaks node-fetch@2/gaxios@6 with
# "Premature close", taking down C2C auth. Bump deliberately after verifying the fix.
FROM node:22.22.3-slim
ARG version=unknown

# Installed from tarballs packed by tools/pack-owox-image-packages.mjs instead of
# from the registry. npm can take upwards of fifteen minutes to serve a freshly
# published @owox/backend, and the build has no reason to wait for it. Third-party
# dependencies still resolve from npm as usual.
WORKDIR /opt/owox
COPY docker-packages/image-package.json ./package.json
COPY docker-packages/*.tgz ./packages/
RUN npm install --omit=dev --no-audit --no-fund \
  && ln -s /opt/owox/node_modules/.bin/owox /usr/local/bin/owox \
  && installed="$(node -p "require('/opt/owox/node_modules/owox/package.json').version")" \
  && { [ "$version" = "unknown" ] || [ "$installed" = "$version" ] || \
       { echo "tarballs ship owox@$installed but this image is tagged $version"; exit 1; }; } \
  && owox --version \
  && rm -rf ./packages \
  && npm cache clean --force \
  && rm -rf /root/.npm

LABEL org.opencontainers.image.version=$version

# The previous image set no WORKDIR, so the server ran with cwd=/. `.env`, the
# `-e` flag and a relative SQLITE_DB_PATH all resolve against cwd, so installing
# under /opt/owox must not move where the process starts.
WORKDIR /

ENV NODE_OPTIONS="--no-deprecation"
ENTRYPOINT ["owox"]
CMD ["serve"]
