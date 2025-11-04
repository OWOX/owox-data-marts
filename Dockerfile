FROM node:22-slim
ARG version=latest

RUN apt-get update && \
    apt-get install -y python3 make g++ && \
    npm install -g owox@${version} && \
    npm cache clean --force && \
    apt-get remove -y python3 make g++ && \
    apt-get autoremove -y && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

ENTRYPOINT ["owox"]
CMD ["serve"]
