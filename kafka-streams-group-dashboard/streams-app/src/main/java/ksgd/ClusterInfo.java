package ksgd;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ExecutionException;
import org.apache.kafka.clients.admin.Admin;
import org.apache.kafka.clients.admin.DescribeClusterResult;
import org.apache.kafka.clients.admin.ListTopicsOptions;
import org.apache.kafka.clients.admin.LogDirDescription;
import org.apache.kafka.clients.admin.TopicDescription;
import org.apache.kafka.common.Node;
import org.apache.kafka.common.TopicPartitionInfo;
import org.apache.kafka.common.errors.UnknownTopicOrPartitionException;

/**
 * {@code GET /cluster} (Spec 008 Behavior 2): brokers, controller, every topic's partitions with leader, replicas and
 * ISR, and bytes on disk per broker. Read-only; four Admin calls whatever the cluster size.
 */
final class ClusterInfo {
    private ClusterInfo() {}

    static Map<String, Object> describe(Admin admin) throws Exception {
        DescribeClusterResult cluster = admin.describeCluster();
        List<Node> nodes = new ArrayList<>(cluster.nodes().get());
        var names = admin.listTopics(new ListTopicsOptions().listInternal(true)).names().get();
        // per topic: one deleted between listTopics and describeTopics is skipped, not a failed /cluster
        Map<String, TopicDescription> topics = new TreeMap<>();
        for (var e : admin.describeTopics(names).topicNameValues().entrySet()) {
            try {
                topics.put(e.getKey(), e.getValue().get());
            } catch (ExecutionException ex) {
                if (!(ex.getCause() instanceof UnknownTopicOrPartitionException)) throw ex;
            }
        }

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("clusterId", cluster.clusterId().get());
        out.put("controllerId", activeController(admin));
        List<Object> brokers = new ArrayList<>();
        nodes.sort((a, b) -> Integer.compare(a.id(), b.id()));
        for (Node n : nodes) {
            Map<String, Object> b = new LinkedHashMap<>();
            b.put("id", n.id());
            b.put("host", n.host());
            b.put("port", n.port());
            b.put("rack", n.rack());
            brokers.add(b);
        }
        out.put("brokers", brokers);
        List<Object> topicList = new ArrayList<>();
        for (TopicDescription td : topics.values()) {
            List<Object> partitions = new ArrayList<>();
            for (TopicPartitionInfo p : td.partitions()) {
                Map<String, Object> m = new LinkedHashMap<>();
                m.put("partition", p.partition());
                m.put("leader", p.leader() == null || p.leader().isEmpty() ? -1 : p.leader().id());
                m.put("replicas", p.replicas().stream().map(Node::id).toList());
                m.put("isr", p.isr().stream().map(Node::id).toList());
                partitions.add(m);
            }
            Map<String, Object> t = new LinkedHashMap<>();
            t.put("name", td.name());
            t.put("internal", td.isInternal());
            t.put("partitions", partitions);
            topicList.add(t);
        }
        out.put("topics", topicList);
        out.put("logDirBytes", logDirBytes(admin, nodes));
        return out;
    }

    /**
     * The active controller: the metadata quorum leader. Not {@code describeCluster().controller()}, which in KRaft is
     * a random live broker (requests to it are forwarded, KIP-590). Null when DescribeQuorum is refused.
     */
    private static Integer activeController(Admin admin) {
        try {
            return admin.describeMetadataQuorum().quorumInfo().get().leaderId();
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * Bytes of all replicas per live broker, each broker on its own: one that fails (shutting down) is left out.
     * Null when no broker answers, e.g. the cluster refuses DescribeLogDirs (needs cluster DESCRIBE).
     */
    private static Map<String, Long> logDirBytes(Admin admin, List<Node> nodes) {
        Map<String, Long> out = new TreeMap<>();
        var perBroker = admin.describeLogDirs(nodes.stream().map(Node::id).toList()).descriptions();
        for (var broker : perBroker.entrySet()) {
            try {
                long sum = 0;
                for (LogDirDescription dir : broker.getValue().get().values())
                    for (var replica : dir.replicaInfos().values()) sum += replica.size();
                out.put(String.valueOf(broker.getKey()), sum);
            } catch (Exception e) {
                // this broker's size stays unknown
            }
        }
        return out.isEmpty() ? null : out;
    }
}
