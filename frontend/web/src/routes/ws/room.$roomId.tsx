import { useWebRTC } from "@/hooks/useWebRTC";
import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";

export const Route = createFileRoute("/ws/room/$roomId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { roomId } = Route.useParams();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useWebRTC(localVideoRef, remoteVideoRef, {
    roomId,
    signalingUrl: "ws://localhost:4000/join",
  });

  return (
    <div>
      <span>Room: {roomId}</span>
      <div className="flex justify-center items-center top-25 right-25 rounded-md overflow-hidden">
        <video playsInline autoPlay muted ref={localVideoRef} />
        <video playsInline autoPlay ref={remoteVideoRef} />
      </div>
    </div>
  );
}
