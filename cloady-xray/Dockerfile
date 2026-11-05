FROM ghcr.io/xtls/xray-core:latest AS xray
FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
COPY --from=xray /usr/local/bin/xray /usr/local/bin/xray
COPY --from=xray /usr/local/share/xray/ /usr/local/share/xray/
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh /usr/local/bin/xray
ENV PORT=3000 WSPATH=/ws
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
