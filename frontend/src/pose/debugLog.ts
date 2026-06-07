export const POSE_LOG_PREFIX = "[SmartGym Pose]";

export type PoseDebugLogEntry = {
  id: number;
  at: string;
  level: "info" | "error";
  event: string;
  details?: unknown;
};

const MAX_LOG_ENTRIES = 80;

let nextId = 1;
let entries: PoseDebugLogEntry[] = [];
const listeners = new Set<(nextEntries: PoseDebugLogEntry[]) => void>();

function notifyListeners() {
  listeners.forEach((listener) => listener(entries));
}

function appendEntry(entry: Omit<PoseDebugLogEntry, "id" | "at">) {
  entries = [
    ...entries,
    {
      ...entry,
      id: nextId,
      at: new Date().toISOString(),
    },
  ].slice(-MAX_LOG_ENTRIES);
  nextId += 1;
  notifyListeners();
}

function safeStringValue(value: unknown, fallback: string) {
  try {
    return String(value);
  } catch {
    return fallback;
  }
}

export function toErrorDiagnostics(caught: unknown) {
  if (caught instanceof Error) {
    return {
      name: caught.name,
      message: caught.message,
      stack: caught.stack,
    };
  }
  if (caught && typeof caught === "object") {
    const maybeError = caught as { message?: unknown; name?: unknown };
    const prototypeLabel = Object.prototype.toString.call(caught);
    const constructorName =
      "constructor" in caught &&
      typeof (caught as { constructor?: { name?: unknown } }).constructor?.name ===
        "string"
        ? (caught as { constructor: { name: string } }).constructor.name
        : prototypeLabel.replace(/^\[object (.*)\]$/, "$1");
    return {
      constructorName,
      keys: Object.keys(caught),
      name: maybeError.name,
      message: maybeError.message,
      stringValue: safeStringValue(caught, prototypeLabel),
    };
  }
  return { value: caught };
}

export function emitPoseLog(event: string, details?: unknown) {
  if (details === undefined) {
    console.info(POSE_LOG_PREFIX, event);
  } else {
    console.info(POSE_LOG_PREFIX, event, details);
  }
  appendEntry({ level: "info", event, details });
}

export function emitPoseError(
  event: string,
  details: unknown,
  caught?: unknown,
) {
  console.error(POSE_LOG_PREFIX, event, details, caught);
  appendEntry({
    level: "error",
    event,
    details:
      caught === undefined
        ? details
        : {
            details,
            caught: toErrorDiagnostics(caught),
          },
  });
}

export function subscribePoseDebugLogs(
  listener: (nextEntries: PoseDebugLogEntry[]) => void,
) {
  listener(entries);
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function clearPoseDebugLogs() {
  entries = [];
  notifyListeners();
}

function formatDetails(details: unknown) {
  if (details === undefined) {
    return "";
  }
  if (typeof details === "string") {
    return ` ${details}`;
  }
  try {
    return ` ${JSON.stringify(details)}`;
  } catch {
    return " [unserializable details]";
  }
}

export function formatPoseDebugLogEntry(entry: PoseDebugLogEntry) {
  const time = new Date(entry.at).toLocaleTimeString();
  return `${time} ${entry.level.toUpperCase()} ${entry.event}${formatDetails(
    entry.details,
  )}`;
}
