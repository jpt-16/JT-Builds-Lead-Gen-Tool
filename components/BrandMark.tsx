import Image from "next/image";

// JT Builds Co logo lockup from jtbuildsco.com. "light" is the white logo for
// the navy sidebar; "dark" is for light backgrounds.
export function BrandMark({ height = 32, variant = "light" }: { height?: number; variant?: "light" | "dark" }) {
  const width = Math.round((574.104 / 224) * height);
  const src = variant === "dark" ? "/logo-lockup-dark.svg" : "/logo-lockup.svg";
  return <Image src={src} alt="JT Builds Co." width={width} height={height} priority unoptimized />;
}
