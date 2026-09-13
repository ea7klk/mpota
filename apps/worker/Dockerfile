FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/package.json
RUN npm ci --workspace apps/worker
COPY apps/worker apps/worker
RUN npm --workspace apps/worker run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY apps/worker/package.json apps/worker/package.json
RUN npm ci --omit=dev --workspace apps/worker && npm cache clean --force
COPY --from=build /app/apps/worker/dist apps/worker/dist
USER node
CMD ["node", "apps/worker/dist/main.js"]
