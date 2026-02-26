import type { SignalingMessage } from "@/types/message";
import { useEffect, useRef, useCallback, useState } from "react";

interface UseWebRTCOptions {
  roomId: string;
  signalingUrl: string;
}

interface PeerState {
  pc: RTCPeerConnection;
  stream: MediaStream | null;
}

export function useWebRTC(
  localVideoRef: React.RefObject<HTMLVideoElement | null>,
  { roomId, signalingUrl }: UseWebRTCOptions,
) {
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  // Reactive state so the component re-renders when remote streams change
  const [remoteStreams, setRemoteStreams] = useState<Map<string, MediaStream>>(
    new Map(),
  );

  const updateRemoteStreams = useCallback(() => {
    const streams = new Map<string, MediaStream>();
    peersRef.current.forEach((peer, peerId) => {
      if (peer.stream) {
        streams.set(peerId, peer.stream);
      }
    });
    setRemoteStreams(new Map(streams));
  }, []);

  const removePeer = useCallback(
    (peerId: string) => {
      const peer = peersRef.current.get(peerId);
      if (peer) {
        peer.pc.close();
        peersRef.current.delete(peerId);
        updateRemoteStreams();
      }
    },
    [updateRemoteStreams],
  );

  const createPeer = useCallback(
    (peerId: string) => {
      const pc = new RTCPeerConnection({
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

      const peerState: PeerState = { pc, stream: null };
      peersRef.current.set(peerId, peerState);

      pc.ontrack = (e) => {
        peerState.stream = e.streams[0];
        updateRemoteStreams();
      };

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          wsRef.current?.send(
            JSON.stringify({
              type: "ice-candidate",
              peerId,
              iceCandidate: e.candidate,
            }),
          );
        }
      };

      pc.oniceconnectionstatechange = () => {
        if (
          pc.iceConnectionState === "disconnected" ||
          pc.iceConnectionState === "failed" ||
          pc.iceConnectionState === "closed"
        ) {
          removePeer(peerId);
        }
      };

      pc.onconnectionstatechange = () => {
        if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed" ||
          pc.connectionState === "closed"
        ) {
          removePeer(peerId);
        }
      };

      pc.onnegotiationneeded = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          wsRef.current?.send(
            JSON.stringify({
              type: "offer",
              peerId,
              offer: pc.localDescription,
            }),
          );
        } catch (err) {
          console.error("Negotiation error", err);
        }
      };

      return pc;
    },
    [updateRemoteStreams, removePeer],
  );

  const handleOffer = useCallback(
    async (peerId: string, offer: RTCSessionDescriptionInit) => {
      // If we already have a connection to this peer, close it first
      removePeer(peerId);

      const pc = createPeer(peerId);

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      wsRef.current?.send(
        JSON.stringify({ type: "answer", peerId, answer: pc.localDescription }),
      );
    },
    [createPeer, removePeer],
  );

  const callPeer = useCallback(
    (peerId: string) => {
      const pc = createPeer(peerId);

      localStreamRef.current?.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!);
      });
    },
    [createPeer],
  );

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
        ws.send(JSON.stringify({ type: "join" }));
      };

      ws.onmessage = async (e) => {
        const message: SignalingMessage = JSON.parse(e.data);

        switch (message.type) {
          case "peer-joined":
            callPeer(message.peerId);
            break;

          case "peers-list":
            for (const peerId of message.peers) {
              callPeer(peerId);
            }
            break;

          case "peer-left":
            removePeer(message.peerId);
            break;

          case "offer":
            await handleOffer(message.peerId, message.offer);
            break;

          case "answer": {
            const peer = peersRef.current.get(message.peerId);
            if (peer) {
              await peer.pc.setRemoteDescription(
                new RTCSessionDescription(message.answer),
              );
            }
            break;
          }

          case "ice-candidate": {
            const peer = peersRef.current.get(message.peerId);
            if (peer) {
              try {
                await peer.pc.addIceCandidate(message.iceCandidate);
              } catch (err) {
                console.error("ICE candidate error:", err);
              }
            }
            break;
          }

          default:
            console.warn("Unknown signaling message:", message);
        }
      };

      ws.onerror = (err) => console.error("WebSocket error:", err);
    };

    start().catch(console.error);

    return () => {
      cancelled = true;
      wsRef.current?.send(JSON.stringify({ type: "leave" }));
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
      peersRef.current.forEach((peer) => peer.pc.close());
      peersRef.current.clear();
      wsRef.current?.close();
      wsRef.current = null;
      localStreamRef.current = null;
    };
  }, [roomId, signalingUrl, callPeer, handleOffer, removePeer, localVideoRef]);

  return { remoteStreams };
}
