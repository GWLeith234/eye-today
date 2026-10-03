import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1E5B4A",
        }}
      >
        <div
          style={{
            width: 120,
            height: 120,
            borderRadius: 60,
            border: "8px solid #FAF8F3",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 42, height: 42, borderRadius: 21, background: "#FAF8F3", display: "flex" }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
