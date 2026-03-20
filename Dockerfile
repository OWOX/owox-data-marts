FROM node:22-slim
ARG version=latest
RUN npm install -g owox@${version} && npm cache clean --force
ENV NODE_OPTIONS="--no-deprecation"
ENTRYPOINT ["owox"]
CMD ["serve"]
