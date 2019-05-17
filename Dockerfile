FROM node:12.2.0-alpine

ENV EDITOR=/usr/bin/nano

COPY . /app
WORKDIR /app

RUN mkdir /data && \
  apk add --update su-exec p7zip openssl nano yarn && \
  rm -rf /var/cache/apk/* && \
  npm ci --production

WORKDIR /app

ENTRYPOINT ["/sbin/su-exec"]
#RUN find / -perm +6000 -type f -exec chmod a-s {} \; || true

