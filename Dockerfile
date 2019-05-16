FROM node:12.2.0-alpine as builder

RUN apk add --update su-exec p7zip openssl nano yarn && rm -rf /var/cache/apk/*

RUN mkdir /app /data
WORKDIR /app

COPY package.json package.json
COPY package-lock.json package-lock.json

COPY lib lib
COPY prompters prompters
COPY schema schema
COPY splash splash
COPY templates templates
COPY test/data testData
COPY features.json features.json
COPY help.json help.json
COPY index.js index.js

RUN npm ci --production
ENV EDITOR=/usr/bin/nano

#WORKDIR /data

#ENTRYPOINT ["/sbin/su-exec"]
#RUN find / -perm +6000 -type f -exec chmod a-s {} \; || true

