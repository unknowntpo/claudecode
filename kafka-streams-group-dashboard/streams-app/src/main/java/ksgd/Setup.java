package ksgd;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.concurrent.ExecutionException;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.AdminClientConfig;
import org.apache.kafka.clients.admin.AlterConfigOp;
import org.apache.kafka.clients.admin.ConfigEntry;
import org.apache.kafka.clients.admin.NewTopic;
import org.apache.kafka.common.config.ConfigResource;
import org.apache.kafka.common.errors.TopicExistsException;

/**
 * {@code setup} mode (Spec 004 Behavior 1): creates the demo source topics if missing and sets the demo
 * group configs, then exits. Idempotent.
 */
final class Setup {
    static final List<String> GROUPS = List.of("word-count", "order-enrichment", "page-view-sessions");
    /** The broker-level group.streams.* defaults are not applied to new groups, so set them per group. */
    static final Map<String, String> GROUP_CONFIGS = Map.of(
            "streams.session.timeout.ms", "10000",
            "streams.heartbeat.interval.ms", "2000");
    /** Spec 002 source topics and partition counts. */
    static final Map<String, Integer> TOPICS = new LinkedHashMap<>();
    static {
        TOPICS.put("text-lines", 12); // enough tasks to see a rebalance move them
        TOPICS.put("orders", 3);
        TOPICS.put("customers", 3);
        TOPICS.put("page-views", 6);
    }

    static void run() throws Exception {
        Properties p = new Properties();
        p.put(AdminClientConfig.BOOTSTRAP_SERVERS_CONFIG, Main.bootstrap());
        try (Admin admin = Admin.create(p)) {
            for (var e : TOPICS.entrySet()) {
                try {
                    admin.createTopics(List.of(new NewTopic(e.getKey(), e.getValue(), (short) 1))).all().get();
                    System.out.println("created topic " + e.getKey() + " (" + e.getValue() + " partitions)");
                } catch (ExecutionException ex) {
                    if (!(ex.getCause() instanceof TopicExistsException)) throw ex;
                    System.out.println("topic " + e.getKey() + " exists");
                }
            }
            List<AlterConfigOp> ops = GROUP_CONFIGS.entrySet().stream()
                    .map(e -> new AlterConfigOp(new ConfigEntry(e.getKey(), e.getValue()), AlterConfigOp.OpType.SET))
                    .toList();
            Map<ConfigResource, Collection<AlterConfigOp>> alter = new LinkedHashMap<>();
            for (String g : GROUPS) alter.put(new ConfigResource(ConfigResource.Type.GROUP, g), ops);
            admin.incrementalAlterConfigs(alter).all().get();
            System.out.println("group configs set for " + GROUPS + ": " + GROUP_CONFIGS);
        }
    }
}
