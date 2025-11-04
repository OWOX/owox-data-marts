FROM node:22 AS builder
ARG version=latest
RUN npm install -g owox@${version} && npm cache clean --force

FROM node:22-slim
ARG version=latest

COPY --from=builder /usr/local/lib/node_modules /usr/local/lib/node_modules
COPY --from=builder /usr/local/bin /usr/local/bin

ENTRYPOINT ["owox"]
CMD ["serve"]
