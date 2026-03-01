import { Button } from "@/components/ui/button";
import LocalVideo from "@/components/video/LocalVideo";
import RemoteVideo from "@/components/video/RemoteVideo";
import { useWebRTC } from "@/hooks/useWebRTC";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Link } from "lucide-react";
import { useRef, useState } from "react";

export const Route = createFileRoute("/room/$roomId")({
  component: RouteComponent,
});

function RouteComponent() {
  const { roomId } = Route.useParams();

  const localVideoRef = useRef<HTMLVideoElement>(null);

  const { remoteStreams } = useWebRTC(localVideoRef, {
    roomId,
    signalingUrl: "ws://localhost:4000/join",
  });

  const [copied, setCopied] = useState(false);

  const linkToClipboard = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-900 via-slate-800 to-slate-900 flex flex-col items-center gap-4 p-4">
      <Button
        className="ml-auto bg-stone-800 hover:bg-stone-700 w-40"
        onClick={linkToClipboard}
      >
        {copied ? (
          <span className="w-full flex items-end justify-between">
            copied <Check className="text-green-600" />
          </span>
        ) : (
          <span className="w-full flex items-end justify-between">
            copy invite link <Link />
          </span>
        )}
      </Button>
      <div className="flex flex-wrap justify-center items-center gap-4 rounded-md overflow-hidden">
        <LocalVideo videoRef={localVideoRef} />
        {[...remoteStreams.entries()].map(([peerId, stream]) => (
          <RemoteVideo key={peerId} stream={stream} />
        ))}
      </div>
    </div>
  );
}
