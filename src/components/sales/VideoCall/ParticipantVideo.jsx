import React, { useEffect, useRef } from "react";

export default function ParticipantVideo({ 
  videoTrack, 
  audioTrack, 
  isLocal = false,
  participantName 
}) {
  const videoRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (videoTrack) {
      const videoElement = videoTrack.attach();
      videoElement.autoplay = true;
      videoElement.muted = isLocal;
      videoElement.style.width = "100%";
      videoElement.style.height = "100%";
      videoElement.style.objectFit = "cover";
      if (videoRef.current) {
        videoRef.current.innerHTML = "";
        videoRef.current.appendChild(videoElement);
      }
      return () => {
        videoTrack.detach().forEach(el => el?.remove?.());
      };
    }
  }, [videoTrack, isLocal]);

  useEffect(() => {
    if (audioTrack && !isLocal) {
      const audioElement = audioTrack.attach();
      audioElement.autoplay = true;
      if (audioRef.current) {
        audioRef.current.appendChild(audioElement);
      }
      return () => {
        audioTrack.detach().forEach(el => el?.remove?.());
      };
    }
  }, [audioTrack, isLocal]);

  return (
    <>
      <div ref={videoRef} className="w-full h-full bg-black" />
      <div ref={audioRef} style={{ display: "none" }} />
    </>
  );
}