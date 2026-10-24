
import { useEffect, useRef, useState } from "react";

import { createCamera } from "../pose/camera.js";
import { createPoseTracker } from "../pose/poseTracker.js";
import {
  startMovement,
  stopMovement,
} from "../movement/movementModule.js";
import { eventBus } from "../shared/eventBus.js";
import { EVENTS, FEEDBACK } from "../shared/contracts.js";

export default function Training({ onFinish }) {
  const videoRef = useRef(null);
  const cameraRef = useRef(null);
  const trackerRef = useRef(null);
  const activeRef = useRef(false);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);
  const videoUrlRef = useRef(null);

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

    const unsubscribeLost = eventBus.on(
      EVENTS.TRACKING_LOST,
      (data) => {
        if (!activeRef.current) return;

        setFeedback(
          `Tracking lost: ${data.reason}. Please stay in frame.`
        );
      }
    );

    const unsubscribePose = eventBus.on(
      EVENTS.POSE_FRAME,
      (frame) => {
        if (activeRef.current && frame.valid) {
          setError("");
        }
      }
    );

    const unsubscribeFeedback = eventBus.on(
      EVENTS.FORM_FEEDBACK,
      (data) => {
        if (!activeRef.current) return;

        if (data.code === FEEDBACK.NOT_DEEP_ENOUGH) {
          setFeedback("Try squatting deeper!");
        } else if (
          data.code === FEEDBACK.LEANING_FORWARD
        ) {
          setFeedback(
            "Keep your chest up and back straight!"
          );
        } else {
          setFeedback(
            data.message || "Check your form."
          );
        }
      }
    );

    return () => {
      mountedRef.current = false;

      unsubscribeRep();
      unsubscribeLost();
      unsubscribePose();
      unsubscribeFeedback();

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
              muted={inputMode === "camera"}
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
