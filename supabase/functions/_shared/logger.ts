/**
 * Structured logger for Edge Functions.
 *
 * Outputs JSON logs that are searchable in Supabase Dashboard → Edge Functions → Logs.
 * Each log entry includes: function name, level, message, optional data, timestamp.
 */

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  fn: string;
  level: LogLevel;
  msg: string;
  data?: Record<string, unknown>;
  ts: string;
  duration_ms?: number;
}

export function createLogger(functionName: string) {
  function log(level: LogLevel, msg: string, data?: Record<string, unknown>) {
    const entry: LogEntry = {
      fn: functionName,
      level,
      msg,
      ts: new Date().toISOString(),
    };
    if (data) entry.data = data;

    const output = JSON.stringify(entry);
    if (level === "error") {
      console.error(output);
    } else if (level === "warn") {
      console.warn(output);
    } else {
      console.log(output);
    }
  }

  return {
    info: (msg: string, data?: Record<string, unknown>) => log("info", msg, data),
    warn: (msg: string, data?: Record<string, unknown>) => log("warn", msg, data),
    error: (msg: string, data?: Record<string, unknown>) => log("error", msg, data),

    /** Track execution time of an async operation */
    async time<T>(label: string, fn: () => Promise<T>): Promise<T> {
      const start = performance.now();
      try {
        const result = await fn();
        log("info", label, { duration_ms: Math.round(performance.now() - start) });
        return result;
      } catch (err) {
        log("error", `${label} failed`, {
          duration_ms: Math.round(performance.now() - start),
          error: err instanceof Error ? err.message : String(err),
        });
        throw err;
      }
    },
  };
}
