package com.example.jmx;

/**
 * Implementation of the SystemInfoMBean interface.
 *
 * This class provides system information that can be accessed via JMX.
 */
public class SystemInfo implements SystemInfoMBean {

    private final long startTime;
    private String applicationMessage;

    public SystemInfo() {
        this.startTime = System.currentTimeMillis();
        this.applicationMessage = "JMX POC Application";
    }

    @Override
    public int getAvailableProcessors() {
        return Runtime.getRuntime().availableProcessors();
    }

    @Override
    public long getTotalMemory() {
        return Runtime.getRuntime().totalMemory();
    }

    @Override
    public long getFreeMemory() {
        return Runtime.getRuntime().freeMemory();
    }

    @Override
    public long getUsedMemory() {
        return getTotalMemory() - getFreeMemory();
    }

    @Override
    public long getUptime() {
        return System.currentTimeMillis() - startTime;
    }

    @Override
    public String getApplicationMessage() {
        return applicationMessage;
    }

    @Override
    public void setApplicationMessage(String message) {
        this.applicationMessage = message;
    }

    @Override
    public void triggerGarbageCollection() {
        System.out.println("Triggering garbage collection...");
        System.gc();
        System.out.println("Garbage collection triggered.");
    }

    @Override
    public String getMemoryInfo() {
        long total = getTotalMemory();
        long free = getFreeMemory();
        long used = getUsedMemory();
        long max = Runtime.getRuntime().maxMemory();

        return String.format(
            "Memory Info:\n" +
            "  Total: %d bytes (%.2f MB)\n" +
            "  Free:  %d bytes (%.2f MB)\n" +
            "  Used:  %d bytes (%.2f MB)\n" +
            "  Max:   %d bytes (%.2f MB)",
            total, total / 1024.0 / 1024.0,
            free, free / 1024.0 / 1024.0,
            used, used / 1024.0 / 1024.0,
            max, max / 1024.0 / 1024.0
        );
    }
}
