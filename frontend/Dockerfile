# syntax=docker/dockerfile:1

# ---------- Stage 1: builder ----------
FROM node:20-alpine AS builder

ARG VITE_API_URL=""
ARG VITE_ENABLE_COLLAB="false"
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_ENABLE_COLLAB=$VITE_ENABLE_COLLAB

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN npm run build

# ---------- Stage 2: runtime (nginx) ----------
FROM nginx:alpine AS runtime

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
