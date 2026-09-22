FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev=false
COPY . .
ENV NITRO_PRESET=node-server
RUN npm run build:vps
ENV HOST=0.0.0.0
ENV PORT=3000
RUN mkdir -p /app/data
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
