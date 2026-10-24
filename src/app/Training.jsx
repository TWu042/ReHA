
import { useEffect, useRef, useState } from "react";

import { createCamera } from "../pose/camera.js";
import { createPoseTracker } from "../pose/poseTracker.js";
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

export default function Training({ onFinish }) {
  const videoRef = useRef(null);
  const cameraRef = useRef(null);
  const trackerRef = useRef(null);
  const activeRef = useRef(false);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  const videoUrlRef = useRef(null);
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

  const target = 10;

  useEffect(() => {
    mountedRef.current = true;

    const unsubscribeRep = eventBus.on(
      EVENTS.REP_COMPLETED,
      (data) => {
        if (!activeRef.current) return;

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

  function handleModeChange(mode) {
    if (
      activeRef.current ||
      startingRef.current ||
      mode === inputMode
    ) {
      return;
    }

    const video = videoRef.current;

    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.srcObject = null;
      video.load();
    }

    setInputMode(mode);
    setError("");
    setReps(0);

    setFeedback(
      mode === "upload"
        ? "Choose a recorded squat video."
        : "Press Start Training to begin!"
    );
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
    setReps(0);
    setError("");

    setFeedback(
      "Video selected. Click Analyze Video to begin."
    );
  }

  function handleTrackerError(err) {
    trackerRef.current?.stop();
    cameraRef.current?.stop();
    videoRef.current?.pause();

    if (activeRef.current) {
      stopMovement();
    }

    activeRef.current = false;

    if (mountedRef.current) {
      setStatus("idle");
      setError(
        err.message || "Pose tracking stopped."
      );
      setFeedback("Tracking stopped.");
    }
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
    inFrameRef.current = null;
    setTracking(null);
    setFormTip("");

    setFeedback(
      inputMode === "upload"
        ? "Loading video analysis..."
        : "Starting camera and pose tracking..."
    );

    const camera =
      inputMode === "camera"
        ? createCamera(video)
        : null;

    const tracker = createPoseTracker(video, {
      onError: handleTrackerError,
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
        video.currentTime = 0;
        video.load();

        if (video.readyState < 2) {
          await new Promise((resolve, reject) => {
            const loaded = () => {
              cleanup();
              resolve();
            };

            const failed = () => {
              cleanup();
              reject(
                new Error(
                  "Cannot load this video format."
                )
              );
            };

            const cleanup = () => {
              video.removeEventListener(
                "loadeddata",
                loaded
              );

              video.removeEventListener(
                "error",
                failed
              );
            };

            video.addEventListener(
              "loadeddata",
              loaded,
              { once: true }
            );

            video.addEventListener(
              "error",
              failed,
              { once: true }
            );

            if (video.readyState >= 2) {
              loaded();
            }
          });
        }
      }

      if (!mountedRef.current) return;

      await tracker.start();

      if (!mountedRef.current) return;

      startMovement();
      movementStarted = true;
      activeRef.current = true;

      if (inputMode === "upload") {
        await video.play();
      }

      if (!mountedRef.current) return;

      setStatus("active");

      setFeedback(
        inputMode === "upload"
          ? "Analyzing uploaded video..."
          : "Camera ready! Start squatting."
      );
    } catch (err) {
      tracker.stop();
      camera?.stop();

      if (movementStarted) {
        stopMovement();
      }

      activeRef.current = false;

      if (mountedRef.current) {
        setStatus("idle");

        setError(
          err.message || "Unable to start training."
        );

        setFeedback(
          "Unable to start training."
        );
      }
    } finally {
      startingRef.current = false;
    }
  }

  function handleEnd() {
    if (!activeRef.current) return;

    activeRef.current = false;

    trackerRef.current?.stop();
    cameraRef.current?.stop();

    if (inputMode === "upload") {
      videoRef.current?.pause();
    }

    const result = stopMovement();

    setStatus("idle");
    setFeedback("Training complete!");
    setTracking(null);
    setFormTip("");
    clearTimeout(tipTimerRef.current);

    onFinish(result);
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

      {/* Choose training mode */}
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
          onClick={() =>
            handleModeChange("camera")
          }
          disabled={isActive || isStarting}
          aria-pressed={inputMode === "camera"}
        >
          Live Camera
        </button>

        <button
          type="button"
          className="primary-button"
          onClick={() =>
            handleModeChange("upload")
          }
          disabled={isActive || isStarting}
          aria-pressed={inputMode === "upload"}
        >
          Upload Video
        </button>
      </div>

      {/* Local video upload */}
      {inputMode === "upload" && (
        <div style={{ marginBottom: 20 }}>
          <label htmlFor="training-video-file">
            Choose a recorded workout video:
          </label>

          <input
            id="training-video-file"
            type="file"
            accept="video/*"
            onChange={handleVideoUpload}
            disabled={isActive || isStarting}
          />

          {selectedVideo && (
            <p>Selected: {selectedVideo}</p>
          )}
        </div>
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
                  ? "Training Active"
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
              // 始终静音：有声视频需要"刚点过按钮"才能自动播放，模型加载久了会被浏览器拒绝
              muted
              playsInline
              controls={false}
              onEnded={() => {
                if (inputMode === "upload") {
                  handleEnd();
                }
              }}
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
                <div
                  style={{
                    textAlign: "center",
                  }}
                >
                  <div className="camera-symbol">
                    ✧
                  </div>

                  <h2>
                    Your journey starts here
                  </h2>

                  <p>
                    Press Start Training to
                    enable camera
                  </p>
                </div>
              )}

            {inputMode === "upload" &&
              !selectedVideo && (
                <div
                  style={{
                    textAlign: "center",
                  }}
                >
                  <div className="camera-symbol">
                    ✧
                  </div>

                  <h2>
                    Upload your workout
                  </h2>

                  <p>
                    Choose a video to analyze
                    your squats
                  </p>
                </div>
              )}
          </div>

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
                style={{
                  width: `${progress}%`,
                }}
              />
            </div>
          </div>

          <div className="glass-panel feedback-panel">
            <div className="section-label">
              ✦ FORM FEEDBACK
            </div>

            <h3>
              {isActive
                ? "Keep going, adventurer!"
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
          ■ End Training →
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
