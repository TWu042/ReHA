const messages = {
  NotAllowedError: '摄像头权限被拒绝。请在浏览器网站设置和 macOS 隐私设置中允许摄像头。',
  SecurityError: '浏览器禁止访问摄像头，请使用 localhost 或 HTTPS。',
  NotFoundError: '没有找到摄像头，请连接摄像头后重试。',
  NotReadableError: '摄像头无法读取，可能被其他应用占用，请关闭占用后重试。',
  OverconstrainedError: '摄像头不支持请求的参数。',
  AbortError: '摄像头启动被中断，请重试。',
}

export function createCamera(videoEl) {
  let stream = null
  let pending = null
  let generation = 0

  function stop() {
    generation++
    stream?.getTracks().forEach(track => track.stop())
    if (videoEl.srcObject === stream) {
      videoEl.pause()
      videoEl.srcObject = null
    }
    stream = null
  }

  function start() {
    if (pending) return pending
    if (stream) return Promise.resolve(stream)
    const token = ++generation
    pending = Promise.resolve().then(async () => {
      let acquired
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('当前环境无法使用摄像头，请使用支持摄像头的浏览器并打开 localhost 或 HTTPS。')
        }
        acquired = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        })
        if (token !== generation) throw new DOMException('启动已取消', 'AbortError')
        stream = acquired
        videoEl.muted = true
        videoEl.playsInline = true
        videoEl.srcObject = stream
        await videoEl.play()
        if (token !== generation) throw new DOMException('启动已取消', 'AbortError')
        return stream
      } catch (cause) {
        acquired?.getTracks().forEach(track => track.stop())
        if (videoEl.srcObject === acquired) {
          videoEl.pause()
          videoEl.srcObject = null
        }
        if (stream === acquired) stream = null
        throw new Error(messages[cause.name] || cause.message || '摄像头启动失败。', { cause })
      } finally {
        pending = null
      }
    })
    return pending
  }

  return { start, stop }
}
