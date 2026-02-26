import LocalVideo from "@/components/video/LocalVideo";
import RemoteVideo from "@/components/video/RemoteVideo";
import { useWebRTC } from "@/hooks/useWebRTC";
import { createFileRoute } from "@tanstack/react-router";
import { useRef } from "react";

export const Route = createFileRoute("/ws/room/$roomId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { roomId } = Route.useParams();

  const localVideoRef = useRef<HTMLVideoElement>(null);

  const { remoteStreams } = useWebRTC(localVideoRef, {
    roomId,
    signalingUrl: "ws://localhost:4000/join",
  });

  return (
    <div>
      <span>Room: {roomId}</span>
      <div className="flex flex-wrap justify-center items-center gap-4 rounded-md overflow-hidden">
        <LocalVideo videoRef={localVideoRef} />
        {[...remoteStreams.entries()].map(([peerId, stream]) => (
          <RemoteVideo key={peerId} stream={stream} />
        ))}
      </div>
    </div>
  );
}
