# OpenSSH PermitUserEnvironment - PATH Handling Trace

## Overview
When `PermitUserEnvironment yes` is set in sshd_config, users can set environment variables via `~/.ssh/environment`, but **PATH is often ignored** while other variables like `FOO=bar` work. This document traces through the OpenSSH source code to explain why.

## Official Documentation References

### OpenSSH 7.8 Release Notes
- **SetEnv Directive Added**: OpenSSH 7.8 introduced the `SetEnv` directive for sshd_config to allow administrators to explicitly specify environment variables
- **Precedence**: "Variables set by SetEnv override the default and client-specified Environment"
- **Security Change**: OpenSSH 7.8 changed the precedence of session environment variables so that `~/.ssh/environment` and `environment="..."` options in authorized_keys files can **no longer override SSH_* variables** set implicitly by sshd
- Source: https://www.openssh.com/txt/release-7.8

### sshd_config Manual Pages
- **PermitUserEnvironment**: Specifies whether ~/.ssh/environment and environment= options in ~/.ssh/authorized_keys are processed by sshd. Valid options are `yes`, `no`, or a pattern-list specifying which environment variable names to accept (e.g., "LANG,LC_*"). Default is `no`.
- **Security Warning**: "Enabling environment processing may enable users to bypass access restrictions in some configurations using mechanisms such as LD_PRELOAD"
- **SetEnv Precedence**: Environment variables set by SetEnv override the default environment and any variables specified by the user via AcceptEnv or PermitUserEnvironment

### Technical Details from Community
- **PATH is hardcoded**: The default PATH is compiled into the sshd binary as `_PATH_STDPATH` (typically `/usr/bin:/bin:/usr/sbin:/sbin`)
- **No variable expansion**: The ~/.ssh/environment file does **not support variable expansion** like `PATH=$PATH:/new/path` - you must specify the full PATH value literally
- **PAM integration**: When OpenSSH is compiled with PAM support (USE_PAM), PAM sets its own environment variables including PATH, which can override user settings

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

## Official Environment Variable Precedence Order

Based on official OpenSSH documentation and source code analysis, environment variables are processed in this order (later entries override earlier ones):

### 1. System Defaults (Lowest Precedence)
- Hardcoded PATH from `_PATH_STDPATH` in sshd binary
- Typically: `/usr/bin:/bin:/usr/sbin:/sbin` (or `/usr/bin:/bin` for non-root)
- For root: `SUPERUSER_PATH` may be used instead

### 2. System Configuration Files
- `/etc/default/login` (on systems with `HAVE_ETC_DEFAULT_LOGIN`)
- `/etc/environment` (read by PAM on some systems)
- Sets initial system-wide PATH

### 3. User Environment from authorized_keys
- `environment="VAR=value"` options in `~/.ssh/authorized_keys`
- Only processed if `PermitUserEnvironment yes` is set
- Subject to optional allowlist filtering
- **Security Note**: Since OpenSSH 7.8, these cannot override SSH_* variables

### 4. User ~/.ssh/environment File
- Read if `PermitUserEnvironment yes` is set
- Subject to optional allowlist filtering (e.g., `PermitUserEnvironment LANG,LC_*`)
- **Important**: No variable expansion supported - must use literal values
- **Can set PATH** at this point, but may be overridden by later steps

### 5. PAM Environment Variables ⚠️ **Critical Override Point**
- Processed if OpenSSH compiled with `USE_PAM` and `UsePAM yes` is set
- PAM modules (especially `pam_env.so`) can set environment variables
- Reads from `/etc/environment` and `/etc/security/pam_env.conf`
- **Overwrites user's PATH from ~/.ssh/environment**
- Only denylisted variables (SSH_AUTH_INFO*, SSH_CONNECTION*) are blocked
- **This is why PATH from ~/.ssh/environment is usually ignored**

### 6. Admin SetEnv Directive (Highest Precedence)
- Set via `SetEnv` directive in `sshd_config` (added in OpenSSH 7.8)
- **Overrides everything** including PAM and user settings
- Example: `SetEnv PATH=/custom/path`
- Use with `Match` blocks for user-specific overrides

### 7. Shell Initialization (Post-SSH)
- After SSH session is established, the shell reads its own config files
- `~/.bash_profile`, `~/.bashrc`, `~/.profile`, etc.
- Can modify PATH again, but only affects that shell session

## Why FOO=bar Works But PATH Doesn't

| Variable | Step 4 (User Sets) | Step 5 (PAM Override) | Final Result |
|----------|-------------------|----------------------|--------------|
| FOO=bar  | ✓ Set to "bar"    | ✗ PAM doesn't set FOO | ✓ User value persists |
| PATH     | ✓ Set to "/custom/path" | ✓ PAM sets PATH | ✗ PAM value wins |

## Important Caveats and Limitations

### Variable Expansion Not Supported
The `~/.ssh/environment` file does **not** support shell variable expansion. This means:
- ✗ `PATH=$PATH:/custom/path` - Does NOT work
- ✓ `PATH=/usr/bin:/bin:/custom/path` - Works (but may be overridden by PAM)
- ✗ `HOME=$HOME/custom` - Does NOT work
- ✓ `FOO=literal_value` - Works

### Security Implications
From the official sshd_config documentation:
> "Enabling environment processing may enable users to bypass access restrictions in some configurations using mechanisms such as LD_PRELOAD"

This is why:
- Default is `PermitUserEnvironment no`
- Allowlist patterns are recommended: `PermitUserEnvironment LANG,LC_*,TZ`
- Never allow LD_PRELOAD, LD_LIBRARY_PATH, or similar dangerous variables

### PAM Configuration
The PAM configuration file (`/etc/pam.d/sshd`) typically includes:
```
session required pam_env.so user_readenv=0
```

Setting `user_readenv=1` is deprecated and has security implications. The `user_readenv` option is separate from OpenSSH's `PermitUserEnvironment` and should not be confused.

## Recommendations Based on Official Documentation

### For Users (PATH that survives PAM)
1. **Best**: Ask admin to set `SetEnv PATH=...` in sshd_config with a Match block
2. **Alternative**: Set PATH in `~/.bashrc` or `~/.bash_profile` (affects interactive shells only)
3. **Workaround**: Set PATH in `~/.ssh/rc` if allowed (PermitUserRC yes)

### For Administrators
1. **Recommended**: Use `SetEnv` directive (OpenSSH 7.8+) for enforcing environment variables:
   ```
   Match User developer
       SetEnv PATH=/usr/local/bin:/usr/bin:/bin
   ```

2. **Alternative**: Configure PAM to not override PATH:
   - Modify `/etc/security/pam_env.conf`
   - Or adjust PAM session configuration in `/etc/pam.d/sshd`

3. **Security**: Use allowlist patterns when enabling PermitUserEnvironment:
   ```
   PermitUserEnvironment LANG,LC_*,TZ
   ```
   Never use: `PermitUserEnvironment yes` without restrictions in production

### For Security Auditors
- Check for `PermitUserEnvironment yes` without allowlist - security risk
- Verify LD_PRELOAD cannot be set via authorized_keys or ~/.ssh/environment
- Remember that SetEnv (admin) overrides PermitUserEnvironment (user)
- Be aware that SSH_* variables cannot be overridden by users (since OpenSSH 7.8)

## Additional Resources

- OpenSSH 7.8 Release Notes: https://www.openssh.com/txt/release-7.8
- OpenBSD sshd_config manual: https://man.openbsd.org/sshd_config
- Source code: https://github.com/openssh/openssh-portable
- Key source files analyzed in this document from openssh-portable repository
