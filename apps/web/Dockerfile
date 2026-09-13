FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_URL=http://localhost:3000/api/v1
ARG VITE_TILE_URL=https://tile.openstreetmap.org/{z}/{x}/{y}.png
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_TILE_URL=$VITE_TILE_URL
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace apps/web
COPY apps/web apps/web
RUN npm --workspace apps/web run build

FROM nginx:1.27-alpine AS runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
