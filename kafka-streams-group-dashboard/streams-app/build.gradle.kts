plugins {
    application
    java
}

repositories { mavenCentral() }

java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }

dependencies {
    implementation("org.apache.kafka:kafka-streams:4.1.0")
    implementation("org.apache.kafka:kafka-clients:4.1.0")
    implementation("com.fasterxml.jackson.core:jackson-databind:2.19.2")
    implementation("org.slf4j:slf4j-simple:2.0.17")
}

application {
    mainClass = "ksgd.Main"
    applicationDefaultJvmArgs = listOf("-Dorg.slf4j.simpleLogger.defaultLogLevel=warn", "-Dorg.slf4j.simpleLogger.logFile=System.err")
}
