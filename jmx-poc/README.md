# JMX POC - Java Management Extensions Proof of Concept

This is a Gradle-based Java application that demonstrates how to expose application metrics and management operations using JMX (Java Management Extensions).

## Project Structure

```
jmx-poc/
├── app/
│   ├── src/
│   │   ├── main/
│   │   │   └── java/
│   │   │       └── com/
│   │   │           └── example/
│   │   │               └── jmx/
│   │   │                   ├── App.java              # Main application
│   │   │                   ├── SystemInfoMBean.java  # MBean interface
│   │   │                   └── SystemInfo.java       # MBean implementation
│   │   └── test/
│   │       └── java/
│   └── build.gradle
├── gradle/
├── gradlew           # Gradle wrapper (Unix)
├── gradlew.bat       # Gradle wrapper (Windows)
└── settings.gradle
```

## What is JMX?

JMX (Java Management Extensions) is a Java technology that provides tools for managing and monitoring applications, system objects, devices, and service-oriented networks. It allows you to:

- Monitor application state and performance metrics
- Change application configuration at runtime
- Trigger operations remotely
- Integrate with monitoring tools

## Features

This POC application exposes a custom MBean (`SystemInfo`) with the following:

### Attributes (Read-only)
- **AvailableProcessors**: Number of processors available to the JVM
- **TotalMemory**: Total memory in the JVM (bytes)
- **FreeMemory**: Free memory in the JVM (bytes)
- **UsedMemory**: Used memory in the JVM (bytes)
- **Uptime**: Application uptime (milliseconds)

### Attributes (Read/Write)
- **ApplicationMessage**: A custom message that can be read and modified

### Operations
- **triggerGarbageCollection()**: Triggers garbage collection
- **getMemoryInfo()**: Returns formatted memory information

## Prerequisites

- Java 21 or higher
- JConsole or VisualVM (included with JDK) for connecting to the JMX server

## Building the Application

### Using Gradle Wrapper (Recommended)

On Unix/Linux/macOS:
```bash
./gradlew build
```

On Windows:
```cmd
gradlew.bat build
```

### Using Installed Gradle

```bash
gradle build
```

## Running the Application

### Using Gradle Wrapper

On Unix/Linux/macOS:
```bash
./gradlew run
```

On Windows:
```cmd
gradlew.bat run
```

### Using Gradle (if installed)

```bash
gradle run
```

### Running the JAR directly

After building:
```bash
java -jar app/build/libs/app.jar
```

When the application starts, you'll see output like:
```
========================================
JMX POC Application Started Successfully
========================================

MBean registered: com.example.jmx:type=SystemInfo

You can now connect to this application using:
  - JConsole
  - VisualVM
  - Any other JMX client
...
```

The application will continue running until you press Ctrl+C.

## Connecting with JConsole

JConsole is a JMX-compliant monitoring tool that comes with the JDK.

### Steps:

1. **Start the application** (in one terminal):
   ```bash
   ./gradlew run
   ```

2. **Open JConsole** (in another terminal):
   ```bash
   jconsole
   ```

3. **Connect to the application**:
   - In the "New Connection" dialog, select the local process named `com.example.jmx.App`
   - Click "Connect"
   - If you see a security warning about insecure connection, click "Insecure connection"

4. **Navigate to the MBean**:
   - Click on the "MBeans" tab
   - In the tree on the left, expand: `com.example.jmx` → `SystemInfo`
   - You'll see "Attributes" and "Operations"

5. **Interact with the MBean**:
   - **View Attributes**: Click on "Attributes" to see real-time values
   - **Modify Attributes**: Double-click on the "ApplicationMessage" value to change it
   - **Execute Operations**: Click on "Operations" and then click buttons to invoke operations

## Connecting with VisualVM

VisualVM is another powerful monitoring tool.

### Steps:

1. **Start the application**:
   ```bash
   ./gradlew run
   ```

2. **Open VisualVM**:
   ```bash
   jvisualvm
   ```

3. **Connect to the application**:
   - In the "Applications" tree on the left, double-click on the `com.example.jmx.App` process
   - Click on the "MBeans" tab
   - Navigate to `com.example.jmx` → `SystemInfo`

## Testing the MBean

### Reading Attributes

1. In JConsole/VisualVM, go to the MBeans tab
2. Navigate to `com.example.jmx` → `SystemInfo` → `Attributes`
3. Click "Refresh" to update values
4. Observe values like `TotalMemory`, `FreeMemory`, `UsedMemory`, `Uptime`

### Modifying Attributes

1. Navigate to the `Attributes` section
2. Find `ApplicationMessage`
3. Double-click the value column
4. Enter a new message (e.g., "Hello from JMX!")
5. Press Enter
6. The value should update immediately

### Invoking Operations

1. Navigate to `Operations`
2. **getMemoryInfo()**: Click the button to see formatted memory information
3. **triggerGarbageCollection()**: Click the button to trigger GC
   - Check the application console to see the GC message
   - Watch the memory attributes before and after

## Code Explanation

### MBean Interface (`SystemInfoMBean.java`)

Following JMX naming conventions, the interface must end with "MBean". It defines:
- Getter methods for read-only attributes
- Getter/setter pairs for read-write attributes
- Other methods for operations

### MBean Implementation (`SystemInfo.java`)

Implements the interface and provides the actual functionality. The class name should be the interface name without the "MBean" suffix.

### Main Application (`App.java`)

1. Gets the platform MBean server:
   ```java
   MBeanServer mBeanServer = ManagementFactory.getPlatformMBeanServer();
   ```

2. Creates the MBean instance:
   ```java
   SystemInfo systemInfo = new SystemInfo();
   ```

3. Registers it with an ObjectName:
   ```java
   ObjectName objectName = new ObjectName("com.example.jmx:type=SystemInfo");
   mBeanServer.registerMBean(systemInfo, objectName);
   ```

4. Keeps the application running:
   ```java
   Thread.currentThread().join();
   ```

## Remote JMX Access

To enable remote JMX access, you can add JVM arguments. Modify `app/build.gradle`:

```groovy
application {
    mainClass = 'com.example.jmx.App'
    applicationDefaultJvmArgs = [
        '-Dcom.sun.management.jmxremote',
        '-Dcom.sun.management.jmxremote.port=9999',
        '-Dcom.sun.management.jmxremote.authenticate=false',
        '-Dcom.sun.management.jmxremote.ssl=false'
    ]
}
```

**Warning**: This configuration disables authentication and SSL. Only use this for local development/testing!

## Troubleshooting

### Cannot connect with JConsole

- Make sure the application is running
- Check that you're selecting the correct process
- On some systems, you may need to run JConsole as the same user as the application

### Attributes not updating

- Click the "Refresh" button in JConsole/VisualVM
- Some tools auto-refresh at intervals

### Application exits immediately

- Make sure you're using `./gradlew run` which keeps the process running
- Check for any exceptions in the console output

## Further Reading

- [JMX Technology Overview](https://docs.oracle.com/javase/tutorial/jmx/overview/index.html)
- [Monitoring and Management Guide](https://docs.oracle.com/en/java/javase/21/management/monitoring-and-management-using-jmx-technology.html)
- [JConsole Documentation](https://docs.oracle.com/en/java/javase/21/management/using-jconsole.html)

## License

This is a proof-of-concept project for educational purposes.
