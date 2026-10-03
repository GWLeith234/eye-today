import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** Iris mark. Same geometry as the wordmark, drawn with layout boxes so the icon font is not required. */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#FAF8F3",
        }}
      >
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            border: "2px solid #14201B",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: 5, background: "#14201B", display: "flex" }} />
        </div>
      </div>
    ),
    { ...size },
  );
}
