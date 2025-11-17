# OpenSSH PermitUserEnvironment - PATH Handling Trace

## Overview
When `PermitUserEnvironment yes` is set in sshd_config, users can set environment variables via `~/.ssh/environment`, but **PATH is often ignored** while other variables like `FOO=bar` work. This document traces through the OpenSSH source code to explain why.

## Key Source Files
- `openssh-portable/session.c` - Main session environment setup
- `openssh-portable/servconf.c` - Configuration parsing
- `openssh-portable/misc.c` - Helper functions including `child_set_env`

## The Problem: Order of Operations

The issue occurs because of the **order in which environment variables are set**. Here's the complete flow in `session.c:do_setup_env()`:

### Step 1: Initial PATH Setup (lines 979-1002)
```c
child_set_env(&env, &envsize, "HOME", pw->pw_dir);
#ifdef HAVE_LOGIN_CAP
if (setusercontext(lc, pw, pw->pw_uid, LOGIN_SETPATH) < 0)
    child_set_env(&env, &envsize, "PATH", _PATH_STDPATH);
else
    child_set_env(&env, &envsize, "PATH", getenv("PATH"));
#else
    read_etc_default_login(&env, &envsize, pw->pw_uid);
    path = child_get_env(env, "PATH");
    if (path == NULL || *path == '\0') {
        child_set_env(&env, &envsize, "PATH",
            s->pw->pw_uid == 0 ?  SUPERUSER_PATH : _PATH_STDPATH);
    }
#endif
```

**Result:** PATH is set to system defaults or from `/etc/default/login`

### Step 2: User Environment from authorized_keys (lines 1052-1068)
```c
if (options.permit_user_env) {
    for (n = 0 ; n < auth_opts->nenv; n++) {
        // Process environment= options from authorized_keys
        // With optional allowlist filtering
    }
}
```

### Step 3: Read ~/.ssh/environment (lines 1070-1076)
```c
/* read $HOME/.ssh/environment. */
if (options.permit_user_env) {
    snprintf(buf, sizeof buf, "%.200s/%s/environment",
        pw->pw_dir, _PATH_SSH_USER_DIR);
    read_environment_file(&env, &envsize, buf,
        options.permit_user_env_allowlist);
}
```

**Result:** If user has `PATH=/custom/path` in `~/.ssh/environment`, it **overrides** the system PATH at this point.

### Step 4: PAM Environment Override (lines 1078-1101) ⚠️ **THIS IS THE KEY**
```c
#ifdef USE_PAM
if (options.use_pam) {
    char **p;

    p = fetch_pam_child_environment();
    copy_environment_denylist(p, &env, &envsize,
        PAM_ENV_DENYLIST);
    free_pam_environment(p);

    p = fetch_pam_environment();
    copy_environment_denylist(p, &env, &envsize,
        PAM_ENV_DENYLIST);
    free_pam_environment(p);
}
#endif
```

**Result:** PAM sets its own environment variables, **including PATH**, which **overwrites** the user's PATH from ~/.ssh/environment!

### Step 5: Admin SetEnv (lines 1104-1113)
```c
/* Environment specified by admin */
for (i = 0; i < options.num_setenv; i++) {
    // Apply SetEnv directives from sshd_config
}
```

## How child_set_env Works (misc.c:2387)

The `child_set_env` function **replaces** existing environment variables:

```c
void child_set_env(char ***envp, u_int *envsizep, const char *name,
    const char *value)
{
    // ... initialization ...

    // Find existing variable
    for (i = 0; env[i]; i++)
        if (strncmp(env[i], name, namelen) == 0 && env[i][namelen] == '=')
            break;
    if (env[i]) {
        /* Reuse the slot - REPLACES existing value */
        free(env[i]);
    }
    // ... set new value ...
}
```

## The Denylist Mechanism (session.c:896)

The `copy_environment_denylist` function is supposed to filter variables, but **PATH is not in the denylist**:

```c
#define PAM_ENV_DENYLIST  "SSH_AUTH_INFO*,SSH_CONNECTION*"

copy_environment_denylist(p, &env, &envsize, PAM_ENV_DENYLIST);
```

This denylist only blocks `SSH_AUTH_INFO*` and `SSH_CONNECTION*`, **not PATH**. Therefore, if PAM sets PATH, it gets copied and overrides the user's setting.

## Why FOO=bar Works But PATH Doesn't

1. **FOO=bar**: Set in ~/.ssh/environment (Step 3) → PAM doesn't set FOO → User's value persists ✅
2. **PATH**: Set in ~/.ssh/environment (Step 3) → PAM sets PATH (Step 4) → User's value is overwritten ❌

## Solutions

### Solution 1: Disable PAM PATH Setting
Configure PAM to not set PATH. This depends on your PAM configuration, typically in `/etc/pam.d/sshd`.

### Solution 2: Use PermitUserEnvironment Allowlist (Doesn't Help)
```bash
# In sshd_config
PermitUserEnvironment PATH,FOO,BAR
```
This allows filtering which variables can be set from ~/.ssh/environment, but **doesn't prevent PAM from overriding them later**.

### Solution 3: Use SetEnv in sshd_config
```bash
# In sshd_config
Match User username
    SetEnv PATH=/custom/path
```
This sets PATH in Step 5, **after** PAM, so it won't be overridden.

### Solution 4: Set PATH in ~/.ssh/rc
Create `~/.ssh/rc` to set environment variables that will be used when starting the shell:
```bash
#!/bin/sh
export PATH=/custom/path
```

Note: This requires `PermitUserRC yes` in sshd_config (which is the default).

### Solution 5: Build OpenSSH Without PAM
Rebuild OpenSSH with `--without-pam` to avoid PAM's PATH override entirely.

## Configuration Reference

### PermitUserEnvironment in sshd_config

From `sshd_config.5`:
```
PermitUserEnvironment
    Specifies whether ~/.ssh/environment and environment= options
    in ~/.ssh/authorized_keys are processed by sshd(8).

    Valid options are yes, no or a pattern-list specifying which
    environment variable names to accept (for example "LANG,LC_*").

    The default is no.

    Enabling environment processing may enable users to bypass
    access restrictions in some configurations using mechanisms
    such as LD_PRELOAD.
```

### Read Environment File Function (session.c:795)

```c
static void
read_environment_file(char ***env, u_int *envsize,
    const char *filename, const char *allowlist)
{
    // ... file reading ...

    if (allowlist != NULL &&
        match_pattern_list(cp, allowlist, 0) != 1)
        continue;  // Skip if not in allowlist

    child_set_env(env, envsize, cp, value);
}
```

When `PermitUserEnvironment yes` is used, the `allowlist` parameter is NULL, so all variables are accepted (except they may be overridden later by PAM or SetEnv).

## Timeline Summary

```
1. System sets PATH to default              → PATH=/usr/bin:/bin
2. User ~/.ssh/environment sets PATH        → PATH=/custom/path  ✓
3. PAM sets PATH (if USE_PAM is defined)    → PATH=/usr/bin:/bin ✗ (overwrites user)
4. Admin SetEnv sets PATH (if configured)   → PATH=/admin/path
```

## Code Locations

- Environment setup: `session.c:do_setup_env()` (line ~945)
- Read ~/.ssh/environment: `session.c:1070-1076`
- PAM environment merge: `session.c:1078-1101`
- Set environment variable: `misc.c:child_set_env()` (line 2387)
- Copy PAM environment: `session.c:copy_environment_denylist()` (line 896)
- PermitUserEnvironment config: `servconf.c:1713-1737`
