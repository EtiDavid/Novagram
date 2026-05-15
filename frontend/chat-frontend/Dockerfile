# build stage
FROM node:25-alpine3.22 AS build

WORKDIR /app

COPY package-lock.json package.json ./

RUN npm ci

COPY . /app

RUN npm run build


# runtime stage
FROM nginx:alpine

ARG NGINX_CONF=default.dev.conf

RUN rm /etc/nginx/conf.d/default.conf

COPY --from=build /app/build /usr/share/nginx/html

COPY nginx/${NGINX_CONF} /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]