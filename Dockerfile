FROM node:20-bookworm-slim AS build
WORKDIR /app

ARG DEBIAN_MIRROR=mirrors.tuna.tsinghua.edu.cn

RUN set -eux; \
    if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
      sed -i "s|http://deb.debian.org/debian|http://${DEBIAN_MIRROR}/debian|g; s|http://deb.debian.org/debian-security|http://${DEBIAN_MIRROR}/debian-security|g" /etc/apt/sources.list.d/debian.sources; \
    fi; \
    if [ -f /etc/apt/sources.list ]; then \
      sed -i "s|http://deb.debian.org/debian|http://${DEBIAN_MIRROR}/debian|g; s|http://deb.debian.org/debian-security|http://${DEBIAN_MIRROR}/debian-security|g" /etc/apt/sources.list; \
    fi; \
    apt-get -o Acquire::Retries=5 update; \
    apt-get install -y --no-install-recommends python3 make g++; \
    rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime
WORKDIR /app

ARG DEBIAN_MIRROR=mirrors.tuna.tsinghua.edu.cn

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/bbcare.sqlite
ENV DIST_DIR=/app/dist

RUN set -eux; \
    if [ -f /etc/apt/sources.list.d/debian.sources ]; then \
      sed -i "s|http://deb.debian.org/debian|http://${DEBIAN_MIRROR}/debian|g; s|http://deb.debian.org/debian-security|http://${DEBIAN_MIRROR}/debian-security|g" /etc/apt/sources.list.d/debian.sources; \
    fi; \
    if [ -f /etc/apt/sources.list ]; then \
      sed -i "s|http://deb.debian.org/debian|http://${DEBIAN_MIRROR}/debian|g; s|http://deb.debian.org/debian-security|http://${DEBIAN_MIRROR}/debian-security|g" /etc/apt/sources.list; \
    fi; \
    apt-get -o Acquire::Retries=5 update; \
    apt-get install -y --no-install-recommends python3 ca-certificates; \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/server ./server

EXPOSE 3000
CMD ["node", "server/index.js"]
