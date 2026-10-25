import { useEffect, useRef, useState } from "react";

import { createCamera } from "../pose/camera.js";
import { createPoseTracker, MAX_LIVE_FPS } from "../pose/poseTracker.js";

import {
  startMovement,
  stopMovement,
} from "../movement/movementModule.js";

import { eventBus } from "../shared/eventBus.js";
import { EVENTS, FEEDBACK } from "../shared/contracts.js";

// tracking_lost 的原因 → 页面上显示的话
const LOST_TEXT = {
  no_person: "No one detected. Please step into the frame.",
  incomplete_landmarks: "Your body isn't fully detected.",
  low_visibility: "Can't see your whole body. Step back or improve the lighting.",
  out_of_frame: "Part of your body is out of the frame. Please step back.",
  video_stalled: "The video feed paused.",
  detection_error: "Pose detection error.",
};

// 纠错代码 → 页面上显示的话（P4 的原始提示是中文，界面是英文）
const TIP_TEXT = {
  [FEEDBACK.NOT_DEEP_ENOUGH]: "Try squatting deeper!",
  [FEEDBACK.LEANING_FORWARD]: "Keep your chest up and back straight!",
};
const TIP_DURATION_MS = 3000;

const OFFLINE_FPS = 10;
const OFFLINE_FRAME_INTERVAL = 1 / OFFLINE_FPS;

function waitForVideoData(video) {
  if (video.readyState >= 2) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("loadeddata", loaded);
      video.removeEventListener("error", failed);
    };

    const loaded = () => {
      cleanup();
      resolve();
    };

    const failed = () => {
      cleanup();
      reject(new Error("Cannot load this video format."));
    };

    video.addEventListener("loadeddata", loaded);
    video.addEventListener("error", failed);

    if (video.readyState >= 2) {
      loaded();
    }
  });
}

function seekTo(video, time) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener("seeked", completed);
      video.removeEventListener("error", failed);
    };

    const completed = () => {
      cleanup();
      resolve();
    };

    const failed = () => {
      cleanup();
      reject(new Error("Unable to seek video frame."));
    };

    video.addEventListener("seeked", completed);
    video.addEventListener("error", failed);

    video.currentTime = time;

    if (!video.seeking) {
      cleanup();
      resolve();
    }
  });
}

function yieldToBrowser() {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

export default function Training({ onFinish }) {
  const videoRef = useRef(null);
  const cameraRef = useRef(null);
  const trackerRef = useRef(null);

  // Hidden file input for the Upload Video button.
  const fileInputRef = useRef(null);

  const activeRef = useRef(false);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  const videoUrlRef = useRef(null);

  const analysisTokenRef = useRef(0);
  const inFrameRef = useRef(null);       // 上一帧是否有效，只在变化时更新页面
  const lostReasonRef = useRef(null);    // 最近一次丢失追踪的原因
  const tipTimerRef = useRef(null);

  // null = 还没收到帧；{ inFrame: true } 或 { inFrame: false, reason }
  const [tracking, setTracking] = useState(null);
  const [formTip, setFormTip] = useState("");

  const [inputMode, setInputMode] = useState("camera");
  const [selectedVideo, setSelectedVideo] = useState("");

  const [reps, setReps] = useState(0);
  const [status, setStatus] = useState("idle");

  const [feedback, setFeedback] = useState(
    "Press Start Training to begin!"
  );

  const [error, setError] = useState("");
  const [analysisProgress, setAnalysisProgress] =
    useState(0);

  const target = 10;

  useEffect(() => {
    mountedRef.current = true;

    const unsubscribeRep = eventBus.on(
      EVENTS.REP_COMPLETED,
      (data) => {
        if (!activeRef.current) return;

        console.log("REP_COMPLETED:", data);

        setReps(data.repCount);

        setFeedback(
          `Great job! Squat ${data.repCount} completed.`
        );
      }
    );

    // 追踪状态单独显示，不写进 feedback，恢复后自动变回 "In the frame"
    const unsubscribeLost = eventBus.on(
      EVENTS.TRACKING_LOST,
      (data) => {
        lostReasonRef.current = data.reason;
        if (!activeRef.current) return;

        console.log("TRACKING_LOST:", data);

        inFrameRef.current = false;
        setTracking({ inFrame: false, reason: data.reason });
      }
    );

    // 每帧都会来，只在"有效 / 无效"切换时才更新页面
    const unsubscribePose = eventBus.on(
      EVENTS.POSE_FRAME,
      (frame) => {
        if (!activeRef.current) return;
        if (frame.valid === inFrameRef.current) return;

        inFrameRef.current = frame.valid;
        if (frame.valid) {
          setTracking({ inFrame: true });
          setError("");
        } else {
          setTracking({ inFrame: false, reason: lostReasonRef.current });
        }
      }
    );

    // 纠错提示显示 3 秒后自动消失
    const unsubscribeFeedback = eventBus.on(
      EVENTS.FORM_FEEDBACK,
      (data) => {
        if (!activeRef.current) return;

        setFormTip(TIP_TEXT[data.code] || data.message || "Check your form.");
        clearTimeout(tipTimerRef.current);
        tipTimerRef.current = setTimeout(() => {
          if (mountedRef.current) setFormTip("");
        }, TIP_DURATION_MS);
      }
    );

    return () => {
      mountedRef.current = false;
      analysisTokenRef.current++;

      unsubscribeRep();
      unsubscribeLost();
      unsubscribePose();
      unsubscribeFeedback();
      clearTimeout(tipTimerRef.current);

      activeRef.current = false;
      startingRef.current = false;

      trackerRef.current?.stop();
      cameraRef.current?.stop();

      stopMovement();

      if (videoUrlRef.current) {
        URL.revokeObjectURL(videoUrlRef.current);
        videoUrlRef.current = null;
      }
    };
  }, []);

  function resetVideoElement() {
    const video = videoRef.current;

    if (!video) return;

    video.pause();
    video.removeAttribute("src");
    video.srcObject = null;
    video.load();
  }

  function handleModeChange(mode) {
    if (
      activeRef.current ||
      startingRef.current ||
      mode === inputMode
    ) {
      return;
    }

    analysisTokenRef.current++;

    resetVideoElement();

    setInputMode(mode);
    setError("");
    setReps(0);
    setAnalysisProgress(0);

    setFeedback(
      mode === "upload"
        ? "Choose a recorded squat video."
        : "Press Start Training to begin!"
    );
  }

  function handleUploadClick() {
    if (activeRef.current || startingRef.current) {
      return;
    }

    if (inputMode !== "upload") {
      handleModeChange("upload");
    }

    // Allow selecting the same file again.
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
      fileInputRef.current.click();
    }
  }

  function handleVideoUpload(event) {
    const file = event.target.files?.[0];

    if (
      !file ||
      activeRef.current ||
      startingRef.current
    ) {
      return;
    }

    if (!file.type.startsWith("video/")) {
      setError("Please select a video file.");
      return;
    }

    const video = videoRef.current;

    video?.pause();

    if (videoUrlRef.current) {
      URL.revokeObjectURL(videoUrlRef.current);
    }

    const url = URL.createObjectURL(file);

    videoUrlRef.current = url;

    if (video) {
      video.srcObject = null;
      video.src = url;
      video.load();
    }

    setSelectedVideo(file.name);
    setInputMode("upload");
    setReps(0);
    setAnalysisProgress(0);
    setError("");

    setFeedback(
      "Video selected. Click Analyze Video to begin."
    );

    console.log("VIDEO UPLOADED:", {
      name: file.name,
      size: file.size,
      type: file.type,
    });
  }

  function handleTrackerError(err) {
    console.error("Pose tracking error:", err);

    analysisTokenRef.current++;

    trackerRef.current?.stop();
    cameraRef.current?.stop();
    videoRef.current?.pause();

    if (activeRef.current) {
      stopMovement();
    }

    activeRef.current = false;
    startingRef.current = false;

    if (mountedRef.current) {
      setStatus("idle");

      setError(
        err.message || "Pose tracking stopped."
      );

      setFeedback("Tracking stopped.");
    }
  }

  function finishTraining() {
    if (!activeRef.current) return;

    activeRef.current = false;
    analysisTokenRef.current++;

    trackerRef.current?.stop();
    cameraRef.current?.stop();

    videoRef.current?.pause();

    const result = stopMovement();

    console.log("MOVEMENT RESULT:", result);

    setTracking(null);
    setFormTip("");
    clearTimeout(tipTimerRef.current);

    if (mountedRef.current) {
      setStatus("idle");
      setFeedback("Training complete!");

      onFinish(result);
    }
  }

  async function analyzeUploadedVideo(video, tracker, token) {
    const duration = video.duration;

    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("Invalid video duration.");
    }

    video.pause();

    const frameCount = Math.max(
      1,
      Math.ceil(duration * OFFLINE_FPS)
    );

    const baseTimestamp = performance.now();

    console.log("OFFLINE ANALYSIS START:", {
      duration,
      fps: OFFLINE_FPS,
      frameCount,
      width: video.videoWidth,
      height: video.videoHeight,
    });

    for (let i = 0; i < frameCount; i++) {
      if (
        token !== analysisTokenRef.current ||
        !mountedRef.current ||
        !activeRef.current
      ) {
        return;
      }

      const videoTime = Math.min(
        i * OFFLINE_FRAME_INTERVAL,
        Math.max(0, duration - 0.001)
      );

      await seekTo(video, videoTime);

      if (
        token !== analysisTokenRef.current ||
        !mountedRef.current ||
        !activeRef.current
      ) {
        return;
      }

      const timestampMs =
        baseTimestamp + videoTime * 1000;

      const success = tracker.analyzeFrame(
        timestampMs
      );

      if (!success) {
        throw new Error(
          `Pose analysis failed at ${videoTime.toFixed(2)}s.`
        );
      }

      const percent = Math.round(
        ((i + 1) / frameCount) * 100
      );

      setAnalysisProgress(percent);

      await yieldToBrowser();
    }

    if (
      token !== analysisTokenRef.current ||
      !mountedRef.current ||
      !activeRef.current
    ) {
      return;
    }

    console.log("OFFLINE ANALYSIS COMPLETE:", {
      duration,
      analyzedFrames: frameCount,
    });

    setAnalysisProgress(100);

    finishTraining();
  }

  async function handleStart() {
    if (
      startingRef.current ||
      activeRef.current
    ) {
      return;
    }

    const video = videoRef.current;

    if (!video) return;

    if (
      inputMode === "upload" &&
      !videoUrlRef.current
    ) {
      setError("Please select a video first.");
      return;
    }

    startingRef.current = true;

    setStatus("starting");
    setError("");
    setReps(0);
    setAnalysisProgress(0);
    inFrameRef.current = null;
    setTracking(null);
    setFormTip("");

    setFeedback(
      inputMode === "upload"
        ? "Preparing offline video analysis..."
        : "Starting camera and pose tracking..."
    );

    const camera =
      inputMode === "camera"
        ? createCamera(video)
        : null;

    // 实时摄像头限制在每秒 15 帧，减轻电脑负担；离线分析是手动逐帧，不受这个限制
    const tracker = createPoseTracker(video, {
      onError: handleTrackerError,
      maxFps: MAX_LIVE_FPS,
    });

    cameraRef.current = camera;
    trackerRef.current = tracker;

    let movementStarted = false;

    try {
      if (inputMode === "camera") {
        video.removeAttribute("src");
        video.load();

        await camera.start();
      } else {
        video.pause();
        video.srcObject = null;
        video.src = videoUrlRef.current;
        video.load();

        await waitForVideoData(video);

        console.log("VIDEO METADATA:", {
          duration: video.duration,
          videoWidth: video.videoWidth,
          videoHeight: video.videoHeight,
        });
      }

      if (!mountedRef.current) return;

      const started = await tracker.start({
        manual: inputMode === "upload",
      });

      if (!started || !mountedRef.current) return;

      startMovement();
      movementStarted = true;
      activeRef.current = true;

      setStatus("active");

      if (inputMode === "upload") {
        setFeedback("Analyzing uploaded video...");

        const token = ++analysisTokenRef.current;

        startingRef.current = false;

        await analyzeUploadedVideo(
          video,
          tracker,
          token
        );
      } else {
        setFeedback(
          "Camera ready! Start squatting."
        );
      }
    } catch (err) {
      console.error("Training failed:", err);

      analysisTokenRef.current++;

      tracker.stop();
      camera?.stop();

      video.pause();

      if (movementStarted && activeRef.current) {
        stopMovement();
      }

      activeRef.current = false;

      if (mountedRef.current) {
        setStatus("idle");

        setError(
          err.message || "Unable to start training."
        );

        setFeedback("Unable to analyze video.");
      }
    } finally {
      startingRef.current = false;
    }
  }

  function handleEnd() {
    if (!activeRef.current) return;

    console.log("ENDING TRAINING:", {
      inputMode,
      currentTime: videoRef.current?.currentTime,
      duration: videoRef.current?.duration,
    });

    finishTraining();
  }

  const isActive = status === "active";
  const isStarting = status === "starting";

  const progress = Math.min(
    100,
    (reps / target) * 100
  );

  return (
    <section className="training-page">
      <div className="section-label">
        ✦ LEVEL 01 — TRAINING ✦
      </div>

      <h1>Training Adventure</h1>

      <p className="page-description">
        Every repetition brings you closer to your goal.
      </p>

      <div
        className="training-input-modes"
        style={{
          display: "flex",
          gap: 12,
          marginBottom: 20,
        }}
      >
        <button
          type="button"
          className="primary-button"
          onClick={() => handleModeChange("camera")}
          disabled={isActive || isStarting}
          aria-pressed={inputMode === "camera"}
        >
          Live Camera
        </button>

        <button
          type="button"
          className="primary-button"
          onClick={handleUploadClick}
          disabled={isActive || isStarting}
          aria-pressed={inputMode === "upload"}
        >
          Upload Video
        </button>
      </div>

      {/* Hidden input: opened by Upload Video button */}
      <input
        ref={fileInputRef}
        id="training-video-file"
        type="file"
        accept="video/*"
        onChange={handleVideoUpload}
        disabled={isActive || isStarting}
        style={{ display: "none" }}
      />

      {inputMode === "upload" && selectedVideo && (
        <p style={{ marginBottom: 16 }}>
          Selected: {selectedVideo}
        </p>
      )}

      <div className="training-layout">
        <div className="glass-panel camera-panel">
          <div className="panel-heading">
            <span>
              {inputMode === "upload"
                ? "◉ Uploaded Video"
                : "◉ Camera Preview"}
            </span>

            <span className="status-pill">
              {isStarting
                ? "Starting..."
                : isActive
                  ? inputMode === "upload"
                    ? "Analyzing"
                    : "Training Active"
                  : "Ready"}
            </span>
          </div>

          <div
            className="camera-placeholder"
            style={{
              position: "relative",
              overflow: "hidden",
              padding: 0,
            }}
          >
            <video
              ref={videoRef}
              autoPlay={false}
              muted={inputMode === "camera"}
              playsInline
              controls={false}
              style={{
                display:
                  inputMode === "upload"
                    ? selectedVideo
                      ? "block"
                      : "none"
                    : status === "idle"
                      ? "none"
                      : "block",
                width: "100%",
                height: "100%",
                minHeight: "260px",
                objectFit:
                  inputMode === "upload"
                    ? "contain"
                    : "cover",
                transform:
                  inputMode === "camera"
                    ? "scaleX(-1)"
                    : "none",
                borderRadius: "16px",
              }}
            />

            {status === "idle" &&
              inputMode === "camera" && (
                <div style={{ textAlign: "center" }}>
                  <div className="camera-symbol">
                    ✧
                  </div>

                  <h2>Your journey starts here</h2>

                  <p>
                    Press Start Training to enable camera
                  </p>
                </div>
              )}

            {inputMode === "upload" &&
              !selectedVideo && (
                <div style={{ textAlign: "center" }}>
                  <div className="camera-symbol">
                    ✧
                  </div>

                  <h2>Upload your workout</h2>

                  <p>
                    Choose a video to analyze your squats
                  </p>
                </div>
              )}
          </div>

          {inputMode === "upload" &&
            (isActive || isStarting) && (
              <div style={{ marginTop: 16 }}>
                <p>
                  Analyzing video... {analysisProgress}%
                </p>

                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{
                      width: `${analysisProgress}%`,
                    }}
                  />
                </div>
              </div>
            )}

          {isActive && (
            <p
              className={`tracking-indicator ${
                tracking?.inFrame
                  ? "in-frame"
                  : tracking
                  ? "out-of-frame"
                  : ""
              }`}
              role="status"
            >
              {tracking?.inFrame
                ? "● In the frame"
                : tracking
                ? `● ${LOST_TEXT[tracking.reason] || "Please stay in the frame."}`
                : "● Looking for you..."}
            </p>
          )}

          {error && (
            <p
              style={{
                color: "#b42318",
                marginTop: "12px",
              }}
            >
              {error}
            </p>
          )}
        </div>

        <div className="training-sidebar">
          <div className="glass-panel stats-panel">
            <div className="section-label">
              YOUR PROGRESS
            </div>

            <div className="rep-number">
              {reps}
              <span> / {target}</span>
            </div>

            <p>Repetitions completed</p>

            <div className="progress-track">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="glass-panel feedback-panel">
            <div className="section-label">
              ✦ FORM FEEDBACK
            </div>

            <h3>
              {isActive
                ? inputMode === "upload"
                  ? "Analyzing your workout!"
                  : "Keep going, adventurer!"
                : "Ready for your adventure?"}
            </h3>

            {formTip && (
              <p className="form-tip" role="alert">
                ⚠ {formTip}
              </p>
            )}

            <p>{feedback}</p>
          </div>
        </div>
      </div>

      {isActive ? (
        <button
          className="primary-button"
          onClick={handleEnd}
        >
          {inputMode === "upload"
            ? "■ Finish Analysis →"
            : "■ End Training →"}
        </button>
      ) : (
        <button
          className="primary-button"
          onClick={handleStart}
          disabled={isStarting}
        >
          {isStarting
            ? "Starting..."
            : inputMode === "upload"
              ? "▶ Analyze Video"
              : "▶ Start Training"}
        </button>
      )}
    </section>
  );
}
