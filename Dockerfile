FROM node:24-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci

FROM dependencies AS frontend
COPY apps/web ./apps/web
RUN npm run build -w @app/web

FROM dependencies AS backend
COPY apps/api ./apps/api
RUN npm run build -w @app/api

FROM node:24-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/api/package.json apps/api/package.json
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=backend /app/apps/api/dist ./apps/api/dist
COPY --from=frontend /app/apps/web/dist ./apps/web/dist
USER node
EXPOSE 3000
CMD ["npm", "run", "start"]
