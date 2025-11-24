# Java NIO Selector and Channel Demo

This project demonstrates the usage of Java NIO (New I/O) Selector and Channel APIs for building scalable, non-blocking I/O applications.

## Overview

The project includes:

- **NioServer**: A non-blocking echo server using `Selector` and `ServerSocketChannel`
- **NioClient**: A client implementation using `SocketChannel`
- **Main**: Entry point to run either server or client

## Key NIO Concepts Demonstrated

### 1. Selector
- Multiplexing I/O operations from multiple channels
- Single-threaded handling of multiple client connections
- Event-driven architecture (ACCEPT, READ, WRITE events)

### 2. Channels
- **ServerSocketChannel**: Listening for incoming connections
- **SocketChannel**: Client-server communication
- Non-blocking mode configuration

### 3. ByteBuffer
- Efficient data transfer between channels
- Buffer flip/clear operations
- Read/write modes

## Project Structure

```
java-nio-selector-demo/
├── build.gradle
├── settings.gradle
├── gradle/
│   └── wrapper/
│       └── gradle-wrapper.properties
└── src/
    └── main/
        └── java/
            └── com/
                └── example/
                    └── nio/
                        ├── Main.java
                        ├── NioServer.java
                        └── NioClient.java
```

## Prerequisites

- Java 11 or higher
- Gradle 8.5 or higher (wrapper included)

## Building the Project

```bash
./gradlew build
```

## Running the Demo

### Option 1: Using Gradle

**Start the server:**
```bash
./gradlew run --args='server'
```

**In another terminal, start the client:**
```bash
./gradlew run --args='client'
```

### Option 2: Using JAR

**Build the JAR:**
```bash
./gradlew jar
```

**Run server:**
```bash
java -jar build/libs/java-nio-selector-demo-1.0-SNAPSHOT.jar server
```

**Run client:**
```bash
java -jar build/libs/java-nio-selector-demo-1.0-SNAPSHOT.jar client
```

### Option 3: Direct Class Execution

**Run server:**
```bash
./gradlew run --args='server'
```

**Run client:**
```bash
./gradlew run --args='client'
```

## How It Works

### Server (NioServer.java)

1. Creates a `Selector` for multiplexing I/O operations
2. Opens a `ServerSocketChannel` and binds to port 8080
3. Configures the channel as non-blocking
4. Registers the channel with the selector for `ACCEPT` operations
5. Enters an event loop:
   - Calls `selector.select()` to wait for events
   - Processes ready keys:
     - **ACCEPT**: Accepts new client connections
     - **READ**: Reads data from clients
     - **WRITE**: Sends echo responses back to clients
6. Handles multiple clients concurrently with a single thread

### Client (NioClient.java)

1. Opens a `SocketChannel` and connects to the server
2. Sends messages using `ByteBuffer` and channel write operations
3. Receives echo responses from the server
4. Demonstrates proper buffer management (allocate, flip, clear)

## Example Output

**Server:**
```
NIO Server started on port 8080
New client connected: /127.0.0.1:xxxxx
Received from client: Hello, NIO Server!
Received from client: This is message 2
Received from client: Testing Java NIO Channels
Received from client: Goodbye!
Client disconnected: /127.0.0.1:xxxxx
```

**Client:**
```
Connected to server at localhost:8080
Sent 18 bytes: Hello, NIO Server!
Received 24 bytes: Echo: Hello, NIO Server!
Server responded: Echo: Hello, NIO Server!
---
Sent 17 bytes: This is message 2
Received 23 bytes: Echo: This is message 2
Server responded: Echo: This is message 2
---
...
```

## Key Features

- **Non-blocking I/O**: Server doesn't block waiting for I/O operations
- **Scalability**: Single thread handles multiple clients efficiently
- **Event-driven**: Selector notifies when channels are ready for operations
- **Resource efficient**: No thread per client needed

## Testing

You can test the server with multiple clients simultaneously:

```bash
# Terminal 1
./gradlew run --args='server'

# Terminal 2
./gradlew run --args='client'

# Terminal 3
./gradlew run --args='client'

# Terminal 4
./gradlew run --args='client'
```

All clients will be handled by a single server thread.

## Learning Resources

- [Java NIO Tutorial](https://docs.oracle.com/javase/tutorial/essential/io/nio.html)
- [Selector Documentation](https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/nio/channels/Selector.html)
- [ByteBuffer Documentation](https://docs.oracle.com/en/java/javase/11/docs/api/java.base/java/nio/ByteBuffer.html)

## License

This is a demo project for educational purposes.
