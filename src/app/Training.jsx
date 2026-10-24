
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
  video_stalled: "The camera feed paused.",
  detection_error: "Pose detection error.",
};

// 纠错代码 → 页面上显示的话（P4 的原始提示是中文，界面是英文）
const TIP_TEXT = {
  [FEEDBACK.NOT_DEEP_ENOUGH]: "Squat a little lower.",
  [FEEDBACK.LEANING_FORWARD]: "Lift your chest and keep your back straight.",
};
const TIP_DURATION_MS = 3000;

export default function Training({ onFinish }) {
  const videoRef = useRef(null);
  const cameraRef = useRef(null);
  const trackerRef = useRef(null);
  const activeRef = useRef(false);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  const inFrameRef = useRef(null);       // 上一帧是否有效，只在变化时更新页面
  const lostReasonRef = useRef(null);    // 最近一次丢失追踪的原因
  const tipTimerRef = useRef(null);

  const [reps, setReps] = useState(0);
  const [status, setStatus] = useState("idle");
  const [feedback, setFeedback] = useState(
    "Press Start Training to begin!"
  );
  const [error, setError] = useState("");
  // null = 还没收到帧；{ inFrame: true } 或 { inFrame: false, reason }
  const [tracking, setTracking] = useState(null);
  const [formTip, setFormTip] = useState("");

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

        console.log("Rep completed:", data);
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

    const unsubscribeFeedback = eventBus.on(
      EVENTS.FORM_FEEDBACK,
      (data) => {
        if (!activeRef.current) return;

        setFormTip(TIP_TEXT[data.code] || data.message);
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
    };
  }, []);

  async function handleStart() {
    if (startingRef.current || activeRef.current) return;

    startingRef.current = true;
    setStatus("starting");
    setError("");
    setReps(0);
    setFeedback("Starting camera and pose tracking...");
    inFrameRef.current = null;
    setTracking(null);
    setFormTip("");

    console.log("Starting ReHA training...");

    const video = videoRef.current;
    const camera = createCamera(video);

    const tracker = createPoseTracker(video, {
      onError(err) {
        console.error("Pose tracking error:", err);

        tracker.stop();
        camera.stop();
        stopMovement();

        activeRef.current = false;

        if (mountedRef.current) {
          setStatus("idle");
          setError(err.message);
          setFeedback("Tracking stopped.");
        }
      },
    });

    cameraRef.current = camera;
    trackerRef.current = tracker;

    try {
      await camera.start();

      if (!mountedRef.current) return;

      await tracker.start();

      if (!mountedRef.current) return;

      startMovement();
      activeRef.current = true;

      setStatus("active");
      setFeedback("Camera ready! Start squatting.");

      console.log("P1 camera and pose tracking started.");
      console.log("P2 movement detection started.");
    } catch (err) {
      console.error("Training startup failed:", err);

      tracker.stop();
      camera.stop();

      if (mountedRef.current) {
        setStatus("idle");
        setError(err.message);
        setFeedback("Unable to start training.");
      }
    } finally {
      startingRef.current = false;
    }
  }

  function handleEnd() {
    if (!activeRef.current) return;

    console.log("Ending ReHA training...");

    trackerRef.current?.stop();
    cameraRef.current?.stop();

    const result = stopMovement();

    activeRef.current = false;

    setStatus("idle");
    setFeedback("Training complete!");
    setTracking(null);
    setFormTip("");
    clearTimeout(tipTimerRef.current);

    console.log("Movement result:", result);

    onFinish(result);
  }

  const isActive = status === "active";
  const isStarting = status === "starting";
  const progress = Math.min(100, (reps / target) * 100);

  return (
    <section className="training-page">
      <div className="section-label">
        ✦ LEVEL 01 — TRAINING ✦
      </div>

      <h1>Training Adventure</h1>

      <p className="page-description">
        Every repetition brings you closer to your goal.
      </p>

      <div className="training-layout">
        <div className="glass-panel camera-panel">
          <div className="panel-heading">
            <span>◉ Camera Preview</span>

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
              autoPlay
              muted
              playsInline
              style={{
                display: status === "idle" ? "none" : "block",
                width: "100%",
                height: "100%",
                minHeight: "260px",
                objectFit: "cover",
                transform: "scaleX(-1)",
                borderRadius: "16px",
              }}
            />

            {status === "idle" && (
              <div style={{ textAlign: "center" }}>
                <div className="camera-symbol">✧</div>
                <h2>Your journey starts here</h2>
                <p>Press Start Training to enable camera</p>
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
            <p style={{ color: "#b42318", marginTop: "12px" }}>
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
            ? "Starting Camera..."
            : "▶ Start Training"}
        </button>
      )}
    </section>
  );
}
