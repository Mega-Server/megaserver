import type { SignalingMessage } from "@/types/message";
import { useEffect, useRef, useCallback, useState } from "react";

interface UseWebRTCOptions {
  roomId: string;
  signalingUrl: string;
}

interface PeerState {
  pc: RTCPeerConnection;
  stream: MediaStream | null;
  makingOffer: boolean;
  ignoreOffer: boolean;
}

export function useWebRTC(
  localVideoRef: React.RefObject<HTMLVideoElement | null>,
  { roomId, signalingUrl }: UseWebRTCOptions,
) {
  const peersRef = useRef<Map<string, PeerState>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>("");

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

  const addLocalTracks = useCallback((pc: RTCPeerConnection) => {
    localStreamRef.current?.getTracks().forEach((track) => {
      pc.addTrack(track, localStreamRef.current!);
    });
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

      const peerState: PeerState = {
        pc,
        stream: null,
        makingOffer: false,
        ignoreOffer: false,
      };
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
          peerState.makingOffer = true;
          const offer = await pc.createOffer();
          if (pc.signalingState !== "stable") return;
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
        } finally {
          peerState.makingOffer = false;
        }
      };

      return pc;
    },
    [updateRemoteStreams, removePeer],
  );

  const handleOffer = useCallback(
    async (peerId: string, offer: RTCSessionDescriptionInit) => {
      const isPolite = clientIdRef.current > peerId;
      let peerState = peersRef.current.get(peerId);

      if (!peerState) {
        const pc = createPeer(peerId);
        peerState = peersRef.current.get(peerId)!;

        addLocalTracks(pc);
      }

      const pc = peerState.pc;
      const offerCollision =
        peerState.makingOffer || pc.signalingState !== "stable";

      peerState.ignoreOffer = !isPolite && offerCollision;
      if (peerState.ignoreOffer) {
        return;
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // add tracks if not already added
      if (pc.getSenders().length === 0) {
        addLocalTracks(pc);
      }

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      wsRef.current?.send(
        JSON.stringify({
          type: "answer",
          peerId,
          answer: pc.localDescription,
        }),
      );
    },
    [createPeer, removePeer, addLocalTracks],
  );

  const callPeer = useCallback(
    (peerId: string) => {
      // only initiate if we haven't already
      if (peersRef.current.has(peerId)) return;

      const pc = createPeer(peerId);

      addLocalTracks(pc);
    },
    [createPeer, addLocalTracks],
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
          case "client-id":
            clientIdRef.current = message.clientId;
            break;

          case "peer-joined":
            if (clientIdRef.current < message.peerId) {
              callPeer(message.peerId);
            }
            break;

          case "peers-list":
            if (!Array.isArray(message.peers)) {
              console.warn("peers-list message has invalid peers:", message);
              break;
            }
            for (const peerId of message.peers) {
              if (clientIdRef.current < peerId) {
                callPeer(peerId);
              }
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
            if (!peer) {
              console.warn(`Ignoring answer for peer ${message.peerId}.`);
              break;
            }
            if (peer.pc.signalingState !== "have-local-offer") {
              console.warn(
                `Ignoring answer for peer ${message.peerId} - wrong state: ${peer.pc.signalingState}`,
              );
              break;
            }
            await peer.pc.setRemoteDescription(
              new RTCSessionDescription(message.answer),
            );

            break;
          }

          case "ice-candidate": {
            const peer = peersRef.current.get(message.peerId);
            if (peer && peer.pc.remoteDescription) {
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
