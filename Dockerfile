FROM alpine:3.8 as builder

RUN apk add --update bash p7zip openssl yarn && rm -rf /var/cache/apk/*

RUN mkdir /app
WORKDIR /app

COPY package.json package.json

COPY lib lib
COPY prompters prompters
COPY schema schema
COPY splash splash
COPY templates templates
COPY test/data testData
COPY features.json features.json
COPY help.json help.json
COPY index.js index.js


RUN yarn

#RUN rm -rf /app/node_modules

#FROM alpine:3.8

##apache2-utils
#RUN apk add --update su-exec p7zip openssl nano yarn && rm -rf /var/cache/apk/*

RUN mkdir -p /data

#COPY --from=builder /app /app

#WORKDIR /app

#RUN yarn --production


ENV EDITOR=/usr/bin/nano



#WORKDIR /data

#ENTRYPOINT ["/sbin/su-exec"]
#RUN find / -perm +6000 -type f -exec chmod a-s {} \; || true

