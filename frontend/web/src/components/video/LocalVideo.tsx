export default function LocalVideo({
  videoRef,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
}) {
  return <video playsInline autoPlay muted ref={videoRef} />;
}
