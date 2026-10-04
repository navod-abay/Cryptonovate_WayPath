FROM golang:1.24-alpine AS build
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 go build -o /out/planning-allocation .

FROM alpine:3.20
COPY --from=build /out/planning-allocation /usr/local/bin/planning-allocation

EXPOSE 5003
CMD ["planning-allocation"]
