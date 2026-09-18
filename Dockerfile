# Pinned to a specific patch: the floating `node:22-slim` tag shipped Node 22.23.0,
# whose http.Agent regression (https://github.com/nodejs/node/issues/63989) breaks node-fetch@2/gaxios@6 with
# "Premature close", taking down C2C auth. Bump deliberately after verifying the fix.
FROM node:22.22.3-slim
ARG version=unknown
LABEL org.opencontainers.image.version=$version

# Installed from tarballs packed by tools/pack-owox-image-packages.mjs instead of
# from the registry. npm can take upwards of fifteen minutes to serve a freshly
# published @owox/backend, and the build has no reason to wait for it; the tarballs
# are the same bytes `npm publish` would upload. Third-party dependencies still
# resolve from npm as usual.
WORKDIR /opt/owox
COPY docker-packages/image-package.json ./package.json
COPY docker-packages/*.tgz ./packages/
RUN npm install --omit=dev --no-audit --no-fund \
  && ln -s /opt/owox/node_modules/.bin/owox /usr/local/bin/owox \
  && rm -rf ./packages \
  && npm cache clean --force

ENV NODE_OPTIONS="--no-deprecation"
ENTRYPOINT ["owox"]
CMD ["serve"]
