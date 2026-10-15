#!/bin/bash
# One mutant per acceptance behavior, each in a fresh copy of the project. Prints CAUGHT / SURVIVED.
set -u
SRC=/Users/unknowntpo/repo/unknowntpo/claudecode/.claude/worktrees/zealous-hamilton/kafka-streams-group-dashboard
WORK=$(dirname "$0")/work
mutant() { # id file from to test-cmd
  local id=$1 file=$2 from=$3 to=$4 cmd=$5
  rm -rf "$WORK"; rsync -a --exclude node_modules --exclude dist --exclude .gradle "$SRC/" "$WORK/"; ln -s "$SRC/node_modules" "$WORK/node_modules"
  python3 - "$WORK/$file" "$from" "$to" <<'PY' || { echo "$id: MUTANT NOT APPLIED"; return; }
import sys; p,a,b=sys.argv[1:]; s=open(p).read()
assert a in s, "pattern not found"; open(p,'w').write(s.replace(a,b,1))
PY
  if [[ $file == streams-app/* ]]; then (cd "$WORK" && gradle -q -p streams-app installDist) >/dev/null 2>&1 || { echo "$id: BUILD FAILED"; return; }; fi
  if (cd "$WORK" && eval "$cmd") > "$WORK.$id.log" 2>&1; then echo "$id: SURVIVED ($file)"; else echo "$id: CAUGHT ($file)"; fi
  cp "$WORK.$id.log" "$(dirname "$0")/$id.log"
}
U='bun test server scripts'
E() { echo "E2E=1 bun test e2e -t '$1'"; }
mutant RB6  server/real/mapping.ts "return 'UNREVOKED_TASKS'" "return 'UNRELEASED_TASKS'" "$U"
mutant RB10 server/real/backend.ts "cannot reach the inspector / broker" "cannot reach the broker" "$U"
mutant RB11 server/real/backend.ts "if (!this.built) return
    const n" "const n" "$U"
mutant RB15 server/real/mapping.ts "events.push({ kind: 'epoch', message: \`group epoch" "void ({ kind: 'epoch', message: \`group epoch" "$U"
mutant RB1  streams-app/src/main/java/ksgd/Inspector.java 'o.put("clientId", m.clientId());' '' "$(E RB1)"
mutant RB2  streams-app/src/main/java/ksgd/Inspector.java 'if (d != null && d.groupState() == GroupState.DEAD) d = null;' '' "$(E RB2)"
mutant RB3  streams-app/src/main/java/ksgd/StreamsRunner.java 'GROUP_PROTOCOL_CONFIG, "streams"' 'GROUP_PROTOCOL_CONFIG, "classic"' "$(E RB3)"
mutant RB13 streams-app/src/main/java/ksgd/Inspector.java '"streams.heartbeat.interval.ms", "2000"' '"streams.heartbeat.interval.ms", "9000"' "$(E RB13)"
mutant RB4  server/real/backend.ts "p.proc.stdin.write('add-thread\\n')" "p.proc.stdin.write('noop\\n')" "$(E RB4)"
mutant RB5  server/real/backend.ts "{ method: 'POST' }" "{ method: 'GET' }" "$(E RB5)"
mutant RB7  streams-app/src/main/java/ksgd/Inspector.java '"streams.session.timeout.ms", "10000"' '"streams.session.timeout.ms", "45000"' "$(E RB7)"
mutant RB8  streams-app/src/main/java/ksgd/StreamsRunner.java 'streams.close(new KafkaStreams.CloseOptions().leaveGroup(true).timeout(Duration.ofSeconds(10)));' 'Runtime.getRuntime().halt(0);' "$(E RB8)"
mutant RB9  server/real/backend.ts "entry.killed = true
      this.log" "this.log" "$(E RB9)"
rm -rf "$WORK"
