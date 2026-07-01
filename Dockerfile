# Pinned to a specific patch: the floating `node:22-slim` tag shipped Node 22.23.0,
# whose http.Agent regression (https://github.com/nodejs/node/issues/63989) breaks node-fetch@2/gaxios@6 with
# "Premature close", taking down C2C auth. Bump deliberately after verifying the fix.
FROM node:22.22.3-slim
ARG version=latest
RUN npm install -g owox@${version} && npm cache clean --force
ENV NODE_OPTIONS="--no-deprecation"
ENTRYPOINT ["owox"]
CMD ["serve"]
