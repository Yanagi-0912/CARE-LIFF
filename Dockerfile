FROM node:22-alpine AS build

WORKDIR /app

COPY package*.json ./
# --ignore-scripts：build 不需要任何 lifecycle script（lockfile 裡唯一有 install
# script 的是 macOS 專用的 fsevents），關掉可避免套件在安裝階段執行任意程式。
RUN npm ci --ignore-scripts

COPY . .

ARG VITE_LIFF_ID
ARG VITE_API_BASE_URL
ENV VITE_LIFF_ID=${VITE_LIFF_ID}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

RUN npm run build

FROM nginx:1.27-alpine AS runtime

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]