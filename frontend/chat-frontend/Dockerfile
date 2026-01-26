#build stage
FROM node:25-alpine3.22 AS build

WORKDIR /app

COPY package-lock.json package.json ./

RUN npm ci

COPY . /app

ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=$REACT_APP_API_URL

RUN echo "API URL is: $REACT_APP_API_URL"



RUN npm run build

#runtine stage
FROM nginx:alpine


# Remove default nginx configuration
RUN rm /etc/nginx/conf.d/default.conf


# Copy custom nginx config
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy build output
COPY --from=build /app/build /usr/share/nginx/html


EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

