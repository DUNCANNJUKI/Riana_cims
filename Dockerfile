FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY CRMS/package.json CRMS/package-lock.json ./CRMS/
RUN npm ci --prefix CRMS
COPY . .
RUN npm run build:all

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN npm ci --omit=dev --prefix server
COPY server ./server
COPY --from=build /app/dist ./dist
COPY --from=build /app/CRMS/dist ./CRMS/dist
RUN mkdir -p /app/server/backups /app/server/uploads
EXPOSE 8081
WORKDIR /app/server
CMD ["node", "index.js"]
