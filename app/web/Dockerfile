# syntax=docker/dockerfile:1
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN addgroup -S segue && adduser -S segue -G segue
COPY --from=build --chown=segue:segue /app/.next/standalone ./
COPY --from=build --chown=segue:segue /app/.next/static ./.next/static
COPY --from=build --chown=segue:segue /app/public ./public
USER segue
EXPOSE 3000
CMD ["node", "server.js"]
