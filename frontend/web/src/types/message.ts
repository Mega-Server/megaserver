export type SignalingMessage =
  | { type: "client-id"; clientId: string }
  | { type: "peer-joined"; peerId: string }
  | { type: "peers-list"; peers: string[] }
  | { type: "peer-left"; peerId: string }
  | { type: "offer"; peerId: string; offer: RTCSessionDescriptionInit }
  | { type: "answer"; peerId: string; answer: RTCSessionDescriptionInit }
  | {
      type: "ice-candidate";
      peerId: string;
      iceCandidate: RTCIceCandidateInit;
    };
