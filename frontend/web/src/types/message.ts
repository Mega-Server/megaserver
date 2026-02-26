export type SignalingMessage =
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
