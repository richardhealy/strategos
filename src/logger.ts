// Minimal structured logger with request/run ids. Swap for pino in M7.
type Level = "debug" | "info" | "warn" | "error";

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  const line = { ts: new Date().toISOString(), level, msg, ...fields };
  // eslint-disable-next-line no-console
  console[level === "debug" ? "log" : level](JSON.stringify(line));
}

export const log = {
  debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, f),
  info: (m: string, f?: Record<string, unknown>) => emit("info", m, f),
  warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, f),
  error: (m: string, f?: Record<string, unknown>) => emit("error", m, f),
  child: (base: Record<string, unknown>) => ({
    debug: (m: string, f?: Record<string, unknown>) => emit("debug", m, { ...base, ...f }),
    info: (m: string, f?: Record<string, unknown>) => emit("info", m, { ...base, ...f }),
    warn: (m: string, f?: Record<string, unknown>) => emit("warn", m, { ...base, ...f }),
    error: (m: string, f?: Record<string, unknown>) => emit("error", m, { ...base, ...f }),
  }),
};
