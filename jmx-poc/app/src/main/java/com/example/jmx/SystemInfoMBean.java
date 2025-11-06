package com.example.jmx;

/**
 * MBean interface for exposing system information via JMX.
 *
 * Following JMX naming convention: the interface name must end with "MBean"
 * and the implementation class should be named "SystemInfo".
 */
public interface SystemInfoMBean {

    /**
     * Get the current number of available processors.
     * @return number of processors available to the JVM
     */
    int getAvailableProcessors();

    /**
     * Get the total memory in the JVM (in bytes).
     * @return total memory in bytes
     */
    long getTotalMemory();

    /**
     * Get the free memory in the JVM (in bytes).
     * @return free memory in bytes
     */
    long getFreeMemory();

    /**
     * Get the used memory in the JVM (in bytes).
     * @return used memory in bytes
     */
    long getUsedMemory();

    /**
     * Get the uptime of the application (in milliseconds).
     * @return uptime in milliseconds
     */
    long getUptime();

    /**
     * Get a custom application message.
     * @return application message
     */
    String getApplicationMessage();

    /**
     * Set a custom application message.
     * @param message the new message
     */
    void setApplicationMessage(String message);

    /**
     * Trigger garbage collection.
     */
    void triggerGarbageCollection();

    /**
     * Get formatted memory information.
     * @return formatted string with memory details
     */
    String getMemoryInfo();
}
