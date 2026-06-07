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
