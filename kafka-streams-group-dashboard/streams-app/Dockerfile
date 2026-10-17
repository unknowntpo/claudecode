# One image for every demo service (Spec 004): run | produce | setup | inspect, chosen by the command.
FROM gradle:8.14.1-jdk21 AS build
WORKDIR /src
COPY settings.gradle.kts build.gradle.kts ./
COPY gradle gradle
# dependencies in their own layer, so a source change does not download them again
RUN gradle --no-daemon -q dependencies --configuration runtimeClasspath > /dev/null
COPY src src
RUN gradle --no-daemon -q installDist

FROM eclipse-temurin:21-jre
COPY --from=build /src/build/install/streams-app /opt/streams-app
# the compose network's broker listener; override with -e BOOTSTRAP=...
ENV BOOTSTRAP=kafka:19092
ENTRYPOINT ["/opt/streams-app/bin/streams-app"]
