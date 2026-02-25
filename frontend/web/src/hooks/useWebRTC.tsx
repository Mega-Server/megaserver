import { useEffect, useRef, useCallback } from "react";

interface UseWebRTCOptions {
  roomId: string;
  signalingUrl: string;
}

export function useWebRTC(
  localVideoRef: React.RefObject<HTMLVideoElement | null>,
  remoteVideoRef: React.RefObject<HTMLVideoElement | null>,
  { roomId, signalingUrl }: UseWebRTCOptions,
) {
  const peerRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const clearRemoteVideo = useCallback(() => {
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
  }, [remoteVideoRef]);

  const closePeer = useCallback(() => {
    clearRemoteVideo();
    peerRef.current?.close();
    peerRef.current = null;
  }, [clearRemoteVideo]);

  const createPeer = useCallback((): RTCPeerConnection => {
    const peer = new RTCPeerConnection({
      iceServers: [
        {
          urls: [
            "stun:stun1.l.google.com:19302",
            "stun:stun2.l.google.com:19302",
          ],
        },
      ],
      iceCandidatePoolSize: 10,
    });

    peer.ontrack = (e) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = e.streams[0];
      }
    };

    peer.onicecandidate = (e) => {
      if (e.candidate) {
        wsRef.current?.send(JSON.stringify({ iceCandidate: e.candidate }));
      }
    };

    peer.oniceconnectionstatechange = () => {
      if (
        peer.iceConnectionState === "disconnected" ||
        peer.iceConnectionState === "failed" ||
        peer.iceConnectionState === "closed"
      ) {
        closePeer();
      }
    };

    peer.onconnectionstatechange = () => {
      if (
        peer.connectionState === "disconnected" ||
        peer.connectionState === "failed" ||
        peer.connectionState === "closed"
      ) {
        closePeer();
      }
    };

    peer.onnegotiationneeded = async () => {
      try {
        const offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
        wsRef.current?.send(JSON.stringify({ offer: peer.localDescription }));
      } catch (err) {
        console.error("Negotiation error", err);
      }
    };

    return peer;
  }, [remoteVideoRef, closePeer]);

  const handleOffer = useCallback(
    async (offer: RTCSessionDescriptionInit) => {
      peerRef.current = createPeer();

      await peerRef.current.setRemoteDescription(
        new RTCSessionDescription(offer),
      );

      localStreamRef.current?.getTracks().forEach((track) => {
        peerRef.current!.addTrack(track, localStreamRef.current!);
      });

      const answer = await peerRef.current.createAnswer();
      await peerRef.current.setLocalDescription(answer);

      wsRef.current?.send(
        JSON.stringify({ answer: peerRef.current.localDescription }),
      );
    },
    [createPeer],
  );

  const callUser = useCallback(() => {
    peerRef.current = createPeer();

    localStreamRef.current?.getTracks().forEach((track) => {
      peerRef.current!.addTrack(track, localStreamRef.current!);
    });
  }, [createPeer, clearRemoteVideo]);

  useEffect(() => {
    let cancelled = false;

    const start = async () => {
      // 1) get local media
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }

      // 2) open signaling socket
      const ws = new WebSocket(`${signalingUrl}?roomID=${roomId}`);
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ join: true }));
      };

      ws.onmessage = async (e) => {
        const message = JSON.parse(e.data);

        if (message.join) {
          callUser();
        }

        if (message.leave) {
          closePeer();
        }

        if (message.offer) {
          await handleOffer(message.offer);
        }

        if (message.answer) {
          await peerRef.current?.setRemoteDescription(
            new RTCSessionDescription(message.answer),
          );
        }

        if (message.iceCandidate) {
          try {
            await peerRef.current?.addIceCandidate(message.iceCandidate);
          } catch (err) {
            console.error("ICE candidate error:", err);
          }
        }
      };

      ws.onerror = (err) => console.error("WebSocket error:", err);
    };

    start().catch(console.error);

    return () => {
      cancelled = true;
      wsRef.current?.send(JSON.stringify({ leave: true }));
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      peerRef.current?.close();
      wsRef.current?.close();
      peerRef.current = null;
      wsRef.current = null;
      localStreamRef.current = null;
    };
  }, [roomId, signalingUrl, callUser, handleOffer, closePeer, localVideoRef]);
}
