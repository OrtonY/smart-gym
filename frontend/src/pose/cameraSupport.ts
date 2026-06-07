type CameraSupportEnvironment = {
  isSecureContext: boolean;
  mediaDevices?: Pick<MediaDevices, "getUserMedia">;
};

export function getCameraSupportError(environment: CameraSupportEnvironment) {
  if (typeof environment.mediaDevices?.getUserMedia === "function") {
    return null;
  }

  if (!environment.isSecureContext) {
    return "手机浏览器需要 HTTPS 才能打开摄像头。请使用 HTTPS 局域网地址重新进入动作检测。";
  }

  return "当前浏览器不支持摄像头访问，请换用支持 getUserMedia 的浏览器。";
}

export function getBrowserCameraSupportError() {
  return getCameraSupportError({
    isSecureContext: window.isSecureContext,
    mediaDevices: navigator.mediaDevices,
  });
}

function objectErrorDetail(caught: object) {
  const maybeError = caught as { message?: unknown; name?: unknown };
  const name = typeof maybeError.name === "string" ? maybeError.name : "";
  const message = typeof maybeError.message === "string" ? maybeError.message : "";
  return { name, message };
}

export function formatCameraStartupError(caught: unknown) {
  if (typeof caught === "string") {
    return caught;
  }

  if (caught && typeof caught === "object") {
    const { name, message } = objectErrorDetail(caught);

    if (name === "NotAllowedError" || name === "PermissionDeniedError") {
      return "摄像头权限被拒绝。请在浏览器地址栏或系统设置中允许此网站访问摄像头。";
    }
    if (name === "NotFoundError" || name === "DevicesNotFoundError") {
      return "未找到可用摄像头。请确认设备有摄像头，并且没有被系统禁用。";
    }
    if (name === "NotReadableError" || name === "TrackStartError") {
      return "摄像头暂时不可用，可能被其他应用占用。请关闭其他相机应用后重试。";
    }
    if (name === "OverconstrainedError" || name === "ConstraintNotSatisfiedError") {
      return "当前摄像头不支持请求的参数。请重试，或换用其他浏览器。";
    }
    if (name === "SecurityError") {
      return "浏览器安全策略阻止摄像头访问。请确认正在使用 HTTPS 地址。";
    }

    if (caught instanceof Error && message) {
      return message;
    }

    if (name || message) {
      return [name, message].filter(Boolean).join(": ");
    }
  }

  if (caught instanceof Error && caught.message) {
    return caught.message;
  }

  return "摄像头或动作检测启动失败。请确认已允许摄像头权限，并刷新页面重试。";
}
